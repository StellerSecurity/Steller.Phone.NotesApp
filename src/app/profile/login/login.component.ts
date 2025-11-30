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
    private cryptoKeyService: CryptoKeyService
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
    this.showPassword = !this.showPassword;
  }

  async login() {
    if (!this.loginForm.valid) return;

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

        // the user does not have any eak.. kdf etc, can be for several reasons:
        // user created their stellar id on stellarsecurity.com or other places, so it was not needed.
        // let's do it now using the public SDK.
        if (response.user.eak_b64 == null) {
          // 🔐 Create fresh vault & bundle via SDK
          const { header } = await createVault(loginObj.password);
          const bundle = exportServerBundleFromHeader(header);

          const payload = {
            ...bundle,
          };

          // send bundle to backend so it can patch the user with E2EE data
          await this.authService.updateEak(payload);

          // mirror updated crypto fields locally on response.user
          response.user.crypto_version = payload.crypto_version;
          response.user.kdf_params = payload.kdf_params;
          response.user.kdf_salt_b64 = payload.kdf_salt;
          response.user.eak_b64 = payload.eak;
        }

        const user = response.user;
        await this.secureStorageService.setItem('ssUser', JSON.stringify(user));

        const bundle: ServerBundle = {
          crypto_version: user.crypto_version,
          kdf_params: user.kdf_params,      // { algo:'PBKDF2', hash:'SHA-256', iters: 210000 }
          kdf_salt: user.kdf_salt_b64,      // base64
          eak: user.eak_b64,                // base64(IV||CT)
        };

        // 🔓 Derive plaintext EAK from bundle with SDK
        const { eakB64: derivedEakB64 } = await extractPlainEAK(
          loginObj.password,
          bundle,
        );
        let eakB64 = derivedEakB64;

        // Import EAK into runtime crypto (MK in RAM for immediate use)
        await this.cryptoKeyService.importEAK(eakB64);

        // optional app-locker layer
        if (this.notesService.appHasPasswordChallenge()) {
          this.cryptoService.encrypt(
            eakB64,
            this.notesService.getNotesAppPassword(),
          );
          await this.secureStorageService.setItem(
            'ssEakB64_Encrypted',
            eakB64,
          );
        } else {
          await this.secureStorageService.setItem('ssEakB64', eakB64);
        }

        let notes = this.notesService.getNotes();

        // user has app-locker enabled.
        if (this.notesService.getDecryptedNotes() !== null) {
          notes = this.notesService.getDecryptedNotes();
        }

        this.dataService.setForceDownloadOnHome(true);

        if (notes.length === 0) {
          await this.router.navigate(['/']);
        } else {
          try {
            await this.notesApiV1Service.upload(0, JSON.parse(notes));
            console.log('Notes sent.');
          } catch (err) {
            console.log('notes error.', err);
          } finally {
            await this.router.navigate(['/']);
          }
        }
      } else {
        await this.toastMessageService.showError(response.response_message);
      }
    } catch (error: any) {
      console.log(error);
      await this.toastMessageService.showError('Something went wrong');
    } finally {
      this.isSaving = false;
      await this.authService.initializeAuthState();
    }
  }

  navigateToRegister() {
    this.router.navigate(['/profile/create-account']);
  }

  forgotPassword() {
    this.router.navigate(['/profile/forgot-password']);
  }
}
