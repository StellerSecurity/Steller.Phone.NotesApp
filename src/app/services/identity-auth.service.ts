import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { IdentitySession, StellarIdClient } from '../utils/stellar-id-client';
import { SecureStorageService } from './secure-storage.service';
import { CryptoKeyService } from './crypto-key.service';

@Injectable({ providedIn: 'root' })
export class IdentityAuthService {
  private clientPromise: Promise<StellarIdClient> | null = null;
  private recoveryCode: string | null = null;

  constructor(private http: HttpClient, private secure: SecureStorageService, private keys: CryptoKeyService) {}

  private async client(): Promise<StellarIdClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.loadClient().catch(error => { this.clientPromise = null; throw error; });
    }
    return this.clientPromise;
  }

  private async loadClient(): Promise<StellarIdClient> {
    const url = 'https://stellaruserapiprod.azurewebsites.net/api/v2/auth/keys';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok || response.url !== url) throw new Error('identityUnavailable');
      const body = await response.text();
      if (body.length > 2048) throw new Error('identityVerificationFailed');
      const keys = JSON.parse(body);
      if (!keys || Object.keys(keys).sort().join(',') !== 'issuer,methodKey,opaqueKey,version'
        || keys.version !== 1 || keys.issuer !== 'https://id.stellarsecurity.com' || typeof keys.methodKey !== 'string'
        || keys.methodKey.length > 256 || typeof keys.opaqueKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(keys.opaqueKey)) throw new Error('identityVerificationFailed');
      return new StellarIdClient(keys, (operation, payload) => firstValueFrom(
        this.http.post<Record<string, any>>(environment.baseUrl + 'api/v2/auth/' + operation, payload).pipe(timeout(15000)),
      ));
    } finally { clearTimeout(timer); }
  }

  private async marker(email: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase())));
    return 'ssIdentityMode:' + Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async assertAccount(email: string): Promise<void> {
    const raw = await this.secure.getItem('ssUser');
    if (!raw) return;
    const user = JSON.parse(raw);
    if (typeof user?.email !== 'string' || user.email.trim().toLowerCase() !== email.trim().toLowerCase()) throw new Error('identityAccountSwitchRequiresLogout');
  }

  async method(email: string): Promise<'legacy' | 'opaque'> {
    const known = await this.secure.getItem(await this.marker(email));
    return (await this.client()).method(email, known === 'opaque');
  }

  async login(email: string, password: string): Promise<IdentitySession> {
    const session = await (await this.client()).login(email, password);
    try { await this.secure.setItem(await this.marker(email), 'opaque'); }
    catch (error) { session.rootKey.fill(0); throw error; }
    return session;
  }

  async register(email: string, password: string): Promise<IdentitySession> {
    await this.assertAccount(email);
    const client = await this.client();
    const root = crypto.getRandomValues(new Uint8Array(32));
    try {
      const account = await client.register(email, password, root);
      const session = await this.login(email, password);
      if (session.accountId !== account.accountId || !root.every((byte, index) => byte === session.rootKey[index])) {
        session.rootKey.fill(0);
        throw new Error('identityVerificationFailed');
      }
      try { this.recoveryCode = await client.setupRecovery(session, password); }
      catch { this.recoveryCode = null; }
      return session;
    } finally { root.fill(0); }
  }

  sessionResponse(session: IdentitySession): Record<string, any> {
    return { response_code: 200, token: session.token, user: { id: session.accountId, email: session.email,
      auth_version: 2, crypto_version: 'opaque-v1', eak_b64: session.keyEnvelope } };
  }

  async rememberSession(session: IdentitySession): Promise<void> {
    await this.secure.setItem('ssIdentitySession', JSON.stringify({ accountId: session.accountId, email: session.email, tokenId: session.token.split('|')[0],
      expiresAt: session.expiresAt, keyEnvelope: session.keyEnvelope }));
    await this.secure.setItem('ssAuthVersion', '2');
  }

  async clearSession(): Promise<void> {
    this.recoveryCode = null;
    await this.secure.removeItem('ssIdentitySession');
    await this.secure.removeItem('ssAuthVersion');
  }

  get pendingRecoveryCode(): string | null { return this.recoveryCode; }
  clearRecoveryCode(): void { this.recoveryCode = null; }

  private async withSession<T>(work: (session: IdentitySession, client: StellarIdClient) => Promise<T>): Promise<T> {
    const token = await this.secure.getItem('ssToken');
    const raw = await this.secure.getItem('ssIdentitySession');
    if (!token || !raw || await this.secure.getItem('ssAuthVersion') !== '2') throw new Error('identitySessionExpired');
    const session = JSON.parse(raw);
    if (!session || session.tokenId !== token.split('|')[0] || typeof session.accountId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(session.accountId)
      || typeof session.email !== 'string' || !Number.isFinite(Date.parse(session.expiresAt))
      || Date.parse(session.expiresAt) <= Date.now()) throw new Error('identitySessionExpired');
    const client = await this.client();
    return this.keys.withEak(rootKey => work({ ...session, token, rootKey }, client));
  }

  async generateRecoveryCode(password: string): Promise<string> {
    this.recoveryCode = await this.withSession((session, client) => client.setupRecovery(session, password));
    return this.recoveryCode;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.withSession(async (session, client) => {
      const next = await client.changePassword(session, currentPassword, newPassword);
      try {
        await this.rememberSession(next);
        await this.secure.setItem('ssToken', next.token);
      } finally { next.rootKey.fill(0); }
    });
  }

  async recover(email: string, code: string, newPassword: string): Promise<IdentitySession> {
    await this.assertAccount(email);
    const session = await (await this.client()).recover(email, code, newPassword);
    try { await this.secure.setItem(await this.marker(email), 'opaque'); }
    catch (error) { session.rootKey.fill(0); throw error; }
    return session;
  }

  async deleteAccount(password: string): Promise<void> {
    await this.withSession((session, client) => client.removeAccount(session, password));
  }

  async logout(): Promise<void> {
    const token = await this.secure.getItem('ssToken');
    try { if (token && await this.secure.getItem('ssAuthVersion') === '2') await (await this.client()).logout(token); }
    finally { this.recoveryCode = null; }
  }
}
