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
        let eakB64 = derivedEakB64;

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

        if (notes.length === 0) {
          await this.appHaptics.success();
          await this.router.navigate(['/']);
        } else {
          try {
            await this.notesApiV1Service.upload(0, JSON.parse(notes));
          } catch (err) {
          } finally {
            await this.appHaptics.success();
            await this.router.navigate(['/']);
          }
        }
      } else {
        await this.toastMessageService.showError(response.response_message);
      }
    } catch (error: any) {
      await this.toastMessageService.showError(
        this.translatorService.allTranslations?.somethingWentWrong ?? 'Something went wrong',
      );
    } finally {
      this.isSaving = false;
      await this.authService.initializeAuthState();
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
