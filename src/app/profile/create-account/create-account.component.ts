import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';
import {NotesService} from "../../services/notes.service";
import {NotesApiV1Service} from "../../services/notes-api-v1.service";
import {
  CryptoKeyService,
  extractPlainEAK,
  saveWrappedBundle,
  wrapBundleWithPassword_WebCrypto
} from "../../services/crypto-key.service";
import {firstValueFrom} from "rxjs";
import { SecureStorageService } from 'src/app/services/secure-storage.service';
import {DataService} from "../../services/data.service";
import {CryptoService} from "../../services/crypto.service";

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
    length: 4,
    inputClass: 'bottom-border-otp', // must match your CSS class
    allowNumbersOnly: false,
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
              private notesApiV1Service: NotesApiV1Service, private crypto: CryptoKeyService,
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
    // Simulate API call and show verification
    if (!this.createUserForm.valid) return;

    this.isSaving = true;

    try {
      // inside your submit handler
      const createUserObj = {
        // your form fields
        username: this.createUserForm.get('email')?.value, // prefer 'email'
        password: this.createUserForm.get('password')?.value,
      };

      await this.crypto.createVault(createUserObj.password);
      this.crypto.exportRecoveryHeader();

      // DB-compatible payload (packs IV into eak):
      const bundle = this.crypto.exportServerBundleFromHeader();

      const payload = {
        ...createUserObj,
        ...bundle,
      };

      // await the Observable
      const response = await firstValueFrom(this.authService.createAccount(payload));

      if (response.response_code == 200) {
        await this.secureStorageService.setItem("ssToken", response.token);
        await this.secureStorageService.setItem("ssUser", JSON.stringify(response.user));

        const user = response.user;

        const bundle = {
          crypto_version: user.crypto_version,
          kdf_params: user.kdf_params,      // { algo:'PBKDF2', hash:'SHA-256', iters: 210000 }
          kdf_salt: user.kdf_salt_b64,      // base64
          eak: user.eak_b64,                // base64(IV||CT)
        };

        const { eakB64: derivedEakB64 } = await extractPlainEAK(createUserObj.password, bundle);
        let eakB64 = derivedEakB64;

        if (this.notesService.appHasPasswordChallenge()) {
          this.cryptoService.encrypt(eakB64, this.notesService.getNotesAppPassword());
          await this.secureStorageService.setItem("ssEakB64_Encrypted", eakB64);
        } else {
          await this.secureStorageService.setItem("ssEakB64", eakB64);
        }

        let notes = this.notesService.getNotes();

        // user has app-locker enabled.
        if (this.notesService.getDecryptedNotes() !== null) {
          notes = this.notesService.getDecryptedNotes();
        }

        this.dataService.setForceDownloadOnHome(true);

        if (notes.length == 0) {
          this.dataService.setForceDownloadOnHome(true);
          await this.router.navigate(['/']);
        } else {
          console.log("what?");
          await this.notesApiV1Service
            .upload(0, JSON.parse(notes));
          console.log('Notes sent.');
          await this.router.navigate(['/']);
        }
      } else {
        this.toastMessageService.showError(response.response_message);
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
    console.log('Resend code to:', this.email);
  }

  changeEmail() {
    this.showVerificationSection = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;
  }
}
