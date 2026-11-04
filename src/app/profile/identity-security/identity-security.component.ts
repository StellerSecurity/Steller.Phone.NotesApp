import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IdentityAuthService } from '../../services/identity-auth.service';
import { AuthService } from '../../services/auth.service';
import { CryptoKeyService } from '../../services/crypto-key.service';
import { CryptoService } from '../../services/crypto.service';
import { NotesService } from '../../services/notes.service';
import { SecureStorageService } from '../../services/secure-storage.service';
import { DataService } from '../../services/data.service';
import { TranslatorService } from '../../services/translator.service';
import { ToastMessageService } from '../../services/toast-message.service';
import { isPasswordAcceptable } from '../../utils/password-policy';
import { identityCopy } from '../identity-copy';

@Component({ selector: 'app-identity-security', templateUrl: './identity-security.component.html', styleUrls: ['./identity-security.component.scss'] })
export class IdentitySecurityComponent implements OnDestroy {
  readonly recoverMode: boolean;
  newAccount: boolean;
  readonly recoveryForm: FormGroup;
  readonly passwordForm: FormGroup;
  code: string | null = null;
  saved = false;
  isSaving = false;
  showPassword = false;

  constructor(private fb: FormBuilder, private route: ActivatedRoute, private router: Router,
    private identity: IdentityAuthService, private auth: AuthService, private keys: CryptoKeyService,
    private cryptoService: CryptoService, private notes: NotesService, private secure: SecureStorageService,
    private data: DataService, private translator: TranslatorService, private toast: ToastMessageService) {
    this.recoverMode = this.route.snapshot.data['recover'] === true;
    this.newAccount = history.state?.newAccount === true;
    this.recoveryForm = this.fb.group({ email: [history.state?.email ?? '', [Validators.required, Validators.email]],
      code: ['', Validators.required], password: ['', [Validators.required, Validators.minLength(6)]] });
    this.passwordForm = this.fb.group({ current: ['', Validators.required], next: ['', [Validators.required, Validators.minLength(6)]] });
  }

  get t() { return identityCopy(this.translator.language); }

  async ionViewWillEnter(): Promise<void> {
    this.newAccount = history.state?.newAccount === true;
    this.saved = false;
    if (this.recoverMode) this.recoveryForm.get('email')?.setValue(history.state?.email ?? '');
    if (this.recoverMode) return;
    if (await this.secure.getItem('ssAuthVersion') !== '2') { await this.router.navigate(['/profile']); return; }
    this.code = this.identity.pendingRecoveryCode;
  }

  ionViewDidLeave(): void { this.clearSecrets(); }

  ngOnDestroy(): void { this.clearSecrets(); }

  private clearSecrets(): void {
    this.identity.clearRecoveryCode();
    this.code = null;
    this.recoveryForm.reset();
    this.passwordForm.reset();
  }

  async close(): Promise<void> {
    this.identity.clearRecoveryCode();
    this.code = null;
    await this.router.navigate([this.newAccount ? '/' : this.recoverMode ? '/profile/login' : '/profile']);
  }

  async done(): Promise<void> {
    if (!this.saved || this.isSaving) return;
    await this.close();
  }

  async copyCode(): Promise<void> {
    if (!this.code) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(this.code);
      await this.toast.showSuccess(this.t.copied);
    } catch { await this.toast.showError(this.t.manual); }
  }

  private async error(error: unknown): Promise<void> {
    const name = error instanceof Error ? error.message : '';
    const message = name === 'identitySessionExpired' ? this.t.needsLogin : name === 'notesLocked' ? this.t.locked
      : name === 'identityAccountSwitchRequiresLogout' ? this.t.switchAccount : name === 'invalidRecoveryCode' ? this.t.invalidCode : this.t.failed;
    await this.toast.showError(message);
  }

  async generate(): Promise<void> {
    if (this.isSaving) return;
    const password = this.passwordForm.get('current')?.value;
    if (!password) { this.passwordForm.get('current')?.markAsTouched(); return; }
    this.isSaving = true;
    try {
      this.code = await this.identity.generateRecoveryCode(password);
      this.saved = false;
      await this.toast.showSuccess(this.t.codeCreated);
    } catch (error) { await this.error(error); }
    finally { this.passwordForm.get('current')?.reset(); this.isSaving = false; }
  }

  async changePassword(): Promise<void> {
    if (this.isSaving) return;
    if (this.passwordForm.invalid) { this.passwordForm.markAllAsTouched(); return; }
    const password = this.passwordForm.get('next')?.value;
    if (!isPasswordAcceptable(password)) { await this.toast.showError(this.t.weak); return; }
    this.isSaving = true;
    try {
      await this.identity.changePassword(this.passwordForm.get('current')?.value, password);
      await this.auth.initializeAuthState();
      await this.toast.showSuccess(this.t.changed);
      this.passwordForm.reset();
    } catch (error) { await this.error(error); }
    finally { this.isSaving = false; }
  }

  async recover(): Promise<void> {
    if (this.isSaving) return;
    if (this.recoveryForm.invalid) { this.recoveryForm.markAllAsTouched(); return; }
    const password = this.recoveryForm.get('password')?.value;
    if (!isPasswordAcceptable(password)) { await this.toast.showError(this.t.weak); return; }
    this.isSaving = true;
    let root: Uint8Array | null = null;
    try {
      const session = await this.identity.recover(this.recoveryForm.get('email')?.value, this.recoveryForm.get('code')?.value, password);
      root = session.rootKey;
      await this.auth.prepareProtectedSession(session);
      const eakB64 = btoa(String.fromCharCode(...root));
      await this.keys.importEAK(eakB64);
      await this.secure.setItem('ssUser', JSON.stringify(this.identity.sessionResponse(session)['user']));
      if (this.notes.appHasPasswordChallenge()) {
        await this.secure.setItem('ssEakB64_Encrypted', this.cryptoService.encrypt(eakB64, this.notes.getNotesAppPassword()));
        await this.secure.removeItem('ssEakB64');
      } else {
        await this.secure.setItem('ssEakB64', eakB64);
        await this.secure.removeItem('ssEakB64_Encrypted');
      }
      await this.secure.setItem('ssToken', session.token);
      this.data.setForceDownloadOnHome(true);
      await this.auth.initializeAuthState();
      this.recoveryForm.reset();
      await this.router.navigate(['/']);
    } catch (error) { await this.error(error); }
    finally { root?.fill(0); this.isSaving = false; }
  }
}
