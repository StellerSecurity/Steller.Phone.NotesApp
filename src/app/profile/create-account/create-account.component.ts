import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';
import {NotesService} from "../../services/notes.service";
import {NotesApiV1Service} from "../../services/notes-api-v1.service";

import {
  createVault,
  exportServerBundleFromHeader,
  extractPlainEAK,
  decryptTextWithMK,
  ServerBundle,
  unpackCipherBlob,
} from '@stellarsecurity/stellar-crypto';


import {firstValueFrom} from "rxjs";
import { SecureStorageService } from 'src/app/services/secure-storage.service';
import {DataService} from "../../services/data.service";
import {CryptoService} from "../../services/crypto.service";
import { CryptoKeyService } from '../../services/crypto-key.service';
import { AppHapticsService } from '../../services/app-haptics.service';
import { isPasswordAcceptable } from '../../utils/password-policy';

@Component({
  selector: 'app-create-account',
  templateUrl: './create-account.component.html',
  styleUrls: ['./create-account.component.scss'],
})
export class CreateAccountComponent implements OnInit {
  email = '';
  password = '';
  showPassword = false;
  showVerificationSection = false;
  otpValue = '';
  otpConfig = {
    length: 6,
    inputClass: 'bottom-border-otp', // must match your CSS class
    allowNumbersOnly: true,
    isPasswordInput: false,
    disableAutoFocus: false,
    placeholder: ' ',
  };
  createUserForm: FormGroup;
  isSaving = false;

  constructor(private router: Router, private fb: FormBuilder,
              private notesService: NotesService,
              private dataService: DataService,
              private notesApi: NotesApiV1Service,
              private cryptoService: CryptoService,
              private notesApiV1Service: NotesApiV1Service,
              private cryptoKeyService: CryptoKeyService,
              private authService: AuthService, private toastMessageService: ToastMessageService,
              private secureStorageService: SecureStorageService,
              private appHaptics: AppHapticsService) {}

  ngOnInit(): void {
    this.initCreateUserForm();
  }

  initCreateUserForm(): void {
    this.createUserForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required,
        Validators.minLength(6),   // example rule
      ]],
      acceptLegal: [false, Validators.requiredTrue]
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

  private async syncNotesAfterRegister(eakB64: string): Promise<void> {
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
        console.error('Failed to parse local notes during register sync', err);
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
      const foldersJson = JSON.stringify(Array.isArray(res?.folders) ? res.folders : []);

      if (this.notesService.appHasPasswordChallenge()) {
        const encryptedNotesSave = this.cryptoService.encrypt(
          mergedJson,
          this.notesService.getNotesAppPassword(),
        );
        this.notesService.setNotes(encryptedNotesSave);
        const encryptedFoldersSave = this.cryptoService.encrypt(
          foldersJson,
          this.notesService.getNotesAppPassword(),
        );
        this.notesService.setFolders(encryptedFoldersSave);
      } else {
        this.notesService.setNotes(mergedJson);
        this.notesService.setFolders(foldersJson);
      }

      this.notesService.setDecryptedNotes(mergedJson);
      await this.notesService.flushPersistence();
    } catch (err) {
      console.error('Post-register notes download failed', err);
    }
  }

  async createAccount() {
    if (!this.createUserForm.valid) {
      this.createUserForm.markAllAsTouched();
      await this.appHaptics.warning();
      return;
    }
    const password = this.createUserForm.get('password')?.value ?? '';
    if (!isPasswordAcceptable(password)) {
      await this.appHaptics.warning();
      await this.toastMessageService.showError(
        'Password is too weak. Please avoid common passwords like 123456 or password123.'
      );
      return;
    }

    this.isSaving = true;

    try {
      const createUserObj = {
        username: this.createUserForm.get('email')?.value,
        password: this.createUserForm.get('password')?.value,
      };

      const { header } = await createVault(createUserObj.password);
      const bundle = exportServerBundleFromHeader(header);

      const payload = {
        ...createUserObj,
        ...bundle,
      };

      const response = await firstValueFrom(this.authService.createAccount(payload));

      if (response.response_code == 200) {
        await this.secureStorageService.setItem("ssToken", response.token);
        await this.secureStorageService.setItem("ssUser", JSON.stringify(response.user));

        const user = response.user;

        const serverBundle = {
          crypto_version: user.crypto_version,
          kdf_params: user.kdf_params,
          kdf_salt: user.kdf_salt_b64,
          eak: user.eak_b64,
        } as ServerBundle;

        const { eakB64 } = await extractPlainEAK(createUserObj.password, serverBundle);

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
              console.warn('Notes upload was queued during register:', uploadResult.reason);
            }
          } catch (err) {
            console.error('Notes upload failed during register', err);
          }
        }

        await this.syncNotesAfterRegister(eakB64);
        await this.authService.initializeAuthState();
        await this.appHaptics.success();
        await this.router.navigate(['/']);
      } else {
        await this.toastMessageService.showError(response.response_message);
      }
    } catch (error: any) {
      console.error('Create account failed', error);
      await this.toastMessageService.showError(error?.error?.message ?? error?.message ?? error);
    } finally {
      this.isSaving = false;
    }
  }

  goToLogin() {
    this.appHaptics.tap();
    this.router.navigate(['/profile/login']);
  }

  openPrivacyPolicy(event?: Event) {
    this.appHaptics.tap();
    event?.preventDefault();
    event?.stopPropagation();
    window.open('https://stellarsecurity.com/privacy-page', '_blank');
  }

  openTermsPage(event?: Event) {
    this.appHaptics.tap();
    event?.preventDefault();
    event?.stopPropagation();
    window.open('https://stellarsecurity.com/terms-page', '_blank');
  }

  resendCode() {
  }

  changeEmail() {
    this.appHaptics.selectionChanged();
    this.showVerificationSection = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;
  }
}
