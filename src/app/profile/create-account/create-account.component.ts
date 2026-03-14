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
  encryptTextWithMK,
  decryptTextWithMK,
  ServerBundle,
  VaultHeaderV1,
} from '@stellarsecurity/stellar-crypto';


import {firstValueFrom} from "rxjs";
import { SecureStorageService } from 'src/app/services/secure-storage.service';
import {DataService} from "../../services/data.service";
import {CryptoService} from "../../services/crypto.service";
import { CryptoKeyService } from '../../services/crypto-key.service';

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
              private secureStorageService: SecureStorageService) {}

  ngOnInit(): void {
    this.initCreateUserForm();
  }

  initCreateUserForm(): void {
    this.createUserForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required,
        Validators.minLength(6),   // example rule
      ]]
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async createAccount() {
    if (!this.createUserForm.valid) return;

    this.isSaving = true;

    try {
      const createUserObj = {
        username: this.createUserForm.get('email')?.value,
        password: this.createUserForm.get('password')?.value,
      };

      // 🔐 Use stellar-crypto SDK
      const { header, mkRaw } = await createVault(createUserObj.password);
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

        // 5) Derive plaintext EAK from server bundle (so we’re 100% in sync)
        const { eakB64 } = await extractPlainEAK(createUserObj.password, serverBundle);

        // 6) Import EAK into runtime crypto (MK in RAM for immediate use)
        await this.cryptoKeyService.importEAK(eakB64);

        // optional app-locker layer
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

        if (notes.length == 0) {
          this.dataService.setForceDownloadOnHome(true);
          await this.router.navigate(['/']);
        } else {
          await this.notesApiV1Service.upload(0, JSON.parse(notes));
          await this.router.navigate(['/']);
        }
      } else {
        await this.toastMessageService.showError(response.response_message);
      }
    } catch (error: any) {
      await this.toastMessageService.showError(error?.error?.message ?? error?.message ?? error);
    } finally {
      this.isSaving = false;
    }
  }

  goToLogin() {
    this.router.navigate(['/profile/login']);
  }

  resendCode() {
  }

  changeEmail() {
    this.showVerificationSection = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;
  }
}
