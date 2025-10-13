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

    /** Map vault header → your server columns */
    private headerToServerFields(header: any) {
        return {
            crypto_version: 'v1',
            // store base64 values as strings; server will base64_decode to BLOBs
            eak: header.mk_wrapped_b64,
            kdf_salt: header.kdf.salt_b64,
            kdf_params: {
                algo: header.kdf.algo, // 'PBKDF2'
                hash: header.kdf.hash, // 'SHA-256'
                iters: header.kdf.iters // e.g., 210000
            }
            // eak_recovery: '...' // optional, if you implement recovery
        };
    }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async createAccount() {
    // Simulate API call and show verification
    if (this.createUserForm.valid) {
    this.isSaving = true;
    // inside your submit handler
    const createUserObj = {
        // your form fields
        username: this.createUserForm.get('email')?.value,      // prefer 'email'
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

      this.authService.createAccount(payload).subscribe({
        next: (response) => {
          if (response.response_code == 200) {
            // this.showVerificationSection = true;
            this.secureStorageService.setItem("ssToken", response.token);
            this.secureStorageService.setItem("ssUser", JSON.stringify(response.user));

            let user = response.user;

            const bundle = {
              crypto_version: user.crypto_version,
              kdf_params: user.kdf_params,      // { algo:'PBKDF2', hash:'SHA-256', iters: 210000 }
              kdf_salt: user.kdf_salt_b64,      // base64
              eak: user.eak_b64,                // base64(IV||CT)
            };

              extractPlainEAK(createUserObj.password, bundle).then(({ eakB64 }) => {
                  this.secureStorageService.setItem("ssEakB64", eakB64).then(() => {
                      // default we wrap the bundle with 'password'
                      wrapBundleWithPassword_WebCrypto("password", JSON.stringify(bundle)).then(wrapped =>
                          saveWrappedBundle(wrapped))
                          .then(() => {
                              // success (optional)
                          }).catch(err => {
                          console.error("wrap/save failed:", err);
                      });

                      let notes = this.notesService.getNotes();
                      this.dataService.setForceDownloadOnHome(true);

                      if(notes.length == 0) {
                          this.dataService.setForceDownloadOnHome(true);
                          this.router.navigate(['/']);
                      } else {
                          console.log("what?");
                          this.notesApiV1Service
                              .upload(0, JSON.parse(this.notesService.getNotes()))
                              .then(() => {
                                  console.log('Notes sent.');
                                  this.router.navigate(['/']);
                              })
                              .catch(err => {
                                  console.log("notes error.", err);
                                  this.router.navigate(['/']);
                              }).finally(() => {
                                this.isSaving = false;
                                });
                      }
                  });
              }).catch(err => {
                  this.isSaving = false;
                  this.toastMessageService.showError(err);
              });

          } else {
            this.isSaving = false;
            this.toastMessageService.showError(response.response_message);
          }
        },
        error: (error) => {
          this.isSaving = false;
          this.toastMessageService.showError(error?.error?.message);
        },
      });
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
