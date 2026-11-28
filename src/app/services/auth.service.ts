import { Injectable } from '@angular/core';
import {BehaviorSubject, firstValueFrom, Observable, timeout, from, switchMap, map} from 'rxjs';
import { loginDto } from '../constants/models/authDto';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import { auth, baseUrl } from '../constants/api/product.api';
import { SecureStorageService } from './secure-storage.service';
import { IdentityAuthService } from './identity-auth.service';
import { IdentitySession } from '../utils/stellar-id-client';
import { sessionToken } from '../utils/session-token';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private authStateRevision = 0;
  private publishedToken: string | null = null;
  private rememberedSession = false;
  private loggedInSubject = new BehaviorSubject<boolean>(false);

  public readonly loginState$ = this.loggedInSubject.asObservable();

  constructor(private http: HttpClient, private secureStorageService: SecureStorageService, private identity: IdentityAuthService) {
    this.initializeAuthState();
  }

  get isLoggedIn(): boolean {
    return this.loggedInSubject.value || this.rememberedSession;
  }

  get hasActiveSession(): boolean { return this.loggedInSubject.value; }

  async initializeAuthState() {
    const revision = ++this.authStateRevision;
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    let token: string | null = null;
    try { token = await this.identity.ensureSession(); } catch { /* Keep local data and retry. */ }
    if (revision !== this.authStateRevision) return;
    let remembered = false;
    try {
      const meta = JSON.parse(await this.secureStorageService.getItem('ssIdentitySession') || '{}');
      const owner = JSON.parse(await this.secureStorageService.getItem('ssUser') || 'null');
      const storedAccess = await this.secureStorageService.getItem('ssToken');
      remembered = await this.secureStorageService.getItem('ssAuthVersion') === '2' && !meta.refreshRejected
        && typeof storedAccess === 'string' && meta.tokenId === storedAccess.split('|')[0]
        && String(owner?.id) === meta.accountId && typeof meta.email === 'string'
        && String(owner?.email).trim().toLowerCase() === meta.email.trim().toLowerCase()
        && typeof meta.refreshToken === 'string' && /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(meta.refreshToken)
        && Date.parse(meta.refreshExpiresAt) > Date.now();
    } catch { /* No remembered account from malformed metadata. */ }
    if (revision !== this.authStateRevision) return;
    const changed = this.rememberedSession !== remembered; this.rememberedSession = remembered;
    if (changed || this.publishedToken !== token || this.loggedInSubject.value !== !!token) {
      this.publishedToken = token; this.loggedInSubject.next(!!token);
    }
    try { if (await this.secureStorageService.getItem('ssAuthVersion') === '2') {
      const raw = await this.secureStorageService.getItem('ssIdentitySession');
      if (revision !== this.authStateRevision) return;
      if (raw) this.expiryTimer = setTimeout(() => { void this.initializeAuthState(); }, 30000);
    } } catch { if (revision === this.authStateRevision) this.expiryTimer = setTimeout(() => { void this.initializeAuthState(); }, 30000); }
  }

  clearAuthenticationState(): void {
    this.authStateRevision++; if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.rememberedSession = false;
    this.publishedToken = null;
    this.loggedInSubject.next(false);
  }

  async signIn(email: string, password: string, preserveLocalProfile = false): Promise<{ response: any; identity?: IdentitySession }> {
    if (!preserveLocalProfile) await this.identity.assertAccount(email);
    const method = await this.identity.method(email);
    if (method === 'legacy') {
      return { response: await firstValueFrom(this.loginHandling({ username: email, password })) };
    }
    const identity = await this.identity.login(email, password);
    return { response: this.identity.sessionResponse(identity), identity };
  }

  async createProtectedAccount(email: string, password: string): Promise<{ response: any; identity: IdentitySession }> {
    const identity = await this.identity.register(email, password);
    return { response: this.identity.sessionResponse(identity), identity };
  }

  async prepareProtectedSession(session: IdentitySession): Promise<void> {
    await this.secureStorageService.removeItem('ssToken');
    this.loggedInSubject.next(false);
    await this.identity.rememberSession(session);
  }

  async rememberLegacySession(): Promise<void> {
    await this.identity.clearSession();
    await this.secureStorageService.setItem('ssAuthVersion', '1');
  }

  loginMethod(email: string): Promise<'legacy' | 'opaque'> { return this.identity.method(email); }

  async revokeCurrentIdentity(): Promise<void> {
    try { await this.identity.logout(); }
    catch { /* Local logout still removes access on this device. */ }
  }

  createAccount(data: loginDto): Observable<any> {
    return this.http.post<any>(baseUrl + auth.createAcc, data).pipe(timeout(15000));
  }

  loginHandling(data: loginDto): Observable<any> {
    return this.http.post<any>(baseUrl + auth.loginAcc, data).pipe(timeout(15000));
  }

  async updateEak(payload: {
    crypto_version: string;
    kdf_params: {
      algo: string;
      hash: string;
      iters: number;
    };
    kdf_salt: string;
    eak: string;
  }): Promise<any> {
    const TOKEN = await this.secureStorageService.getItem('ssToken');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    return firstValueFrom(
      this.http.patch<any>(baseUrl + auth.updateEak, payload, { headers }).pipe(timeout(15000))
    );
  }

  forgotPassword(email: any): Observable<any> {
    return this.http.post<any>(baseUrl + auth.forgotPassword, { email }).pipe(timeout(15000));
  }

  resetPassword(data: any): Observable<any> {
    return this.http.post<any>(baseUrl + auth.resetPasswordUrl, data).pipe(timeout(15000));
  }

  async buildAuthHeaders(): Promise<HttpHeaders> {
    const token = await sessionToken(this.secureStorageService);
    return new HttpHeaders().set('Authorization', `Bearer ${token ?? ''}`);
  }

  deleteAccount(currentPassword: string): Observable<any> {
    return from(this.secureStorageService.getItem('ssAuthVersion')).pipe(switchMap(version => version === '2'
      ? from(this.identity.deleteAccount(currentPassword)).pipe(map(() => ({ response_code: 200 })))
      : this.deleteLegacyAccount(currentPassword)));
  }

  private deleteLegacyAccount(currentPassword: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.buildAuthHeaders()
        .then((headers) => {
          this.http
            .post<any>(baseUrl + auth.deleteUser, { current_password: currentPassword }, { headers }).pipe(timeout(15000))
            .subscribe({
              next: (response) => {
                subscriber.next(response);
                subscriber.complete();
              },
              error: (error) => subscriber.error(error),
            });
        })
        .catch((error) => subscriber.error(error));
    });
  }
}
