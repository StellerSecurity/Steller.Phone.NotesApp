import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { loginDto } from 'src/app/constants/models/authDto';
import { AuthService } from 'src/app/services/auth.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';
import { NotesService } from '../../services/notes.service';
import { NotesApiV1Service } from '../../services/notes-api-v1.service';
import { firstValueFrom } from 'rxjs';
import { SecureStorageService } from 'src/app/services/secure-storage.service';
import { DataService } from '../../services/data.service';
import { CryptoService } from '../../services/crypto.service';

import {
  createVault,
  exportServerBundleFromHeader,
  extractPlainEAK,
  ServerBundle,
  decryptTextWithMK,
  unpackCipherBlob,
} from '@stellarsecurity/stellar-crypto';
import { CryptoKeyService } from '../../services/crypto-key.service';
import { AppHapticsService } from '../../services/app-haptics.service';
import { TranslatorService } from '../../services/translator.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  showPassword = false;
  loginForm: FormGroup;
  isSaving = false;

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private notesService: NotesService,
    private notesApiV1Service: NotesApiV1Service,
    private authService: AuthService,
    private toastMessageService: ToastMessageService,
    private dataService: DataService,
    private cryptoService: CryptoService,
    private secureStorageService: SecureStorageService,
    private cryptoKeyService: CryptoKeyService,
    private appHaptics: AppHapticsService,
    private translatorService: TranslatorService,
  ) {}

  ngOnInit(): void {
    this.initLoginForm();
  }

  initLoginForm(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  togglePasswordVisibility() {
    this.appHaptics.selectionChanged();
    this.showPassword = !this.showPassword;
  }

  private b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }

  private async syncNotesAfterLogin(eakB64: string): Promise<void> {
    try {
      const res = await this.notesApiV1Service.download(0);
      const serverNotes = res?.notes ?? [];

      let localNotesRaw = this.notesService.getNotes();
      if (this.notesService.getDecryptedNotes() !== null) {
        localNotesRaw = this.notesService.getDecryptedNotes();
      }

      let localNotes: any[] = [];
      try {
        localNotes = localNotesRaw ? JSON.parse(localNotesRaw) : [];
      } catch (err) {
        console.error('Failed to parse local notes during login sync', err);
        localNotes = [];
      }

      const mkRaw = this.b64ToBytes(eakB64);
      const map = new Map<string, any>((localNotes ?? []).map((n: any) => [n.id, n]));

      for (const s of serverNotes) {
        const local = map.get(s.id);

        if (s.deleted) {
          if (!local || (s.last_modified ?? 0) >= (local?.last_modified ?? 0)) {
            map.delete(s.id);
          }
          continue;
        }

        const blobText = unpackCipherBlob(s.text);
        s.text = await decryptTextWithMK(mkRaw, {
          ...blobText,
          v: 1,
          aad_b64: btoa(s.id),
        });

        s.favorite = !!(s.favorite ?? local?.favorite);
        s.pinned = !!(s.pinned ?? local?.pinned);

        if (typeof s.title === 'string' && s.title.length > 0) {
          const blobTitle = unpackCipherBlob(s.title);
          s.title = await decryptTextWithMK(mkRaw, {
            ...blobTitle,
            v: 1,
            aad_b64: btoa(s.id + '#title'),
          });
        } else {
          s.title = '';
        }

        if (!local) {
          map.set(s.id, s);
          continue;
        }

        if ((s.last_modified ?? 0) >= (local.last_modified ?? 0)) {
          map.set(s.id, { ...local, ...s });
        }
      }

      const merged = Array.from(map.values()).filter((n: any) => !n.deleted);
      const mergedJson = JSON.stringify(merged);

      if (this.notesService.appHasPasswordChallenge()) {
        const encryptedNotesSave = this.cryptoService.encrypt(
          mergedJson,
          this.notesService.getNotesAppPassword(),
        );
        this.notesService.setNotes(encryptedNotesSave);
      } else {
        this.notesService.setNotes(mergedJson);
      }

      this.notesService.setDecryptedNotes(mergedJson);
      await this.notesService.flushPersistence();
    } catch (err) {
      console.error('Post-login notes download failed', err);
    }
  }

  async login() {
    if (!this.loginForm.valid) {
      await this.appHaptics.warning();
      return;
    }

    this.isSaving = true;

    const loginObj: loginDto = {
      username: this.loginForm.get('email')?.value,
      password: this.loginForm.get('password')?.value,
    };

    try {
      let response: any = await firstValueFrom(
        this.authService.loginHandling(loginObj),
      );

      if (response.response_code === 200) {
        await this.secureStorageService.setItem('ssToken', response.token);

        if (response.user.eak_b64 == null) {
          const { header } = await createVault(loginObj.password);
          const bundle = exportServerBundleFromHeader(header);

          const payload = {
            ...bundle,
          };

          await this.authService.updateEak(payload);

          response.user.crypto_version = payload.crypto_version;
          response.user.kdf_params = payload.kdf_params;
          response.user.kdf_salt_b64 = payload.kdf_salt;
          response.user.eak_b64 = payload.eak;
        }

        const user = response.user;
        await this.secureStorageService.setItem('ssUser', JSON.stringify(user));

        const bundle: ServerBundle = {
          crypto_version: user.crypto_version,
          kdf_params: user.kdf_params,
          kdf_salt: user.kdf_salt_b64,
          eak: user.eak_b64,
        };

        const { eakB64: derivedEakB64 } = await extractPlainEAK(
          loginObj.password,
          bundle,
        );
        const eakB64 = derivedEakB64;

        await this.cryptoKeyService.importEAK(eakB64);

        if (this.notesService.appHasPasswordChallenge()) {
          const encryptedEakB64 = this.cryptoService.encrypt(
            eakB64,
            this.notesService.getNotesAppPassword(),
          );
          await this.secureStorageService.setItem(
            'ssEakB64_Encrypted',
            encryptedEakB64,
          );
          await this.secureStorageService.removeItem('ssEakB64');
        } else {
          await this.secureStorageService.setItem('ssEakB64', eakB64);
          await this.secureStorageService.removeItem('ssEakB64_Encrypted');
        }

        let notes = this.notesService.getNotes();

        if (this.notesService.getDecryptedNotes() !== null) {
          notes = this.notesService.getDecryptedNotes();
        }

        this.dataService.setForceDownloadOnHome(true);

        if (notes.length > 0) {
          try {
            const parsedNotes = JSON.parse(notes);
            const uploadResult: any = await this.notesApiV1Service.upload(0, parsedNotes);

            if (uploadResult?.queued) {
              console.warn('Notes upload was queued during login:', uploadResult.reason);
            }
          } catch (err) {
            console.error('Notes upload failed during login', err);
          }
        }

        await this.syncNotesAfterLogin(eakB64);
        await this.authService.initializeAuthState();
        await this.appHaptics.success();
        await this.router.navigate(['/']);
        return;
      } else {
        await this.toastMessageService.showError(response.response_message);
      }
    } catch (error: any) {
      console.error('Login failed', error);
      await this.toastMessageService.showError(
        this.translatorService.allTranslations?.somethingWentWrong ?? 'Something went wrong',
      );
    } finally {
      this.isSaving = false;
    }
  }

  navigateToRegister() {
    this.appHaptics.tap();
    this.router.navigate(['/profile/create-account']);
  }

  forgotPassword() {
    this.appHaptics.tap();
    this.router.navigate(['/profile/forgot-password']);
  }
}
