import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { loginDto } from 'src/app/constants/models/authDto';
import { AuthService } from 'src/app/services/auth.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';
import {NotesService} from "../../services/notes.service";
import {NotesApiV1Service} from "../../services/notes-api-v1.service";
import {
    CryptoKeyService, extractPlainEAK,
    packCipherBlob,
    saveWrappedBundle,
    wrapBundleWithPassword_WebCrypto
} from "../../services/crypto-key.service";
import {firstValueFrom} from "rxjs";
import { SecureStorageService } from 'src/app/services/secure-storage.service';
import {DataService} from "../../services/data.service";

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  showPassword = false;
  loginForm: FormGroup;
  isSaving = false;

  constructor(private router: Router, private fb: FormBuilder,
     private notesService: NotesService,
     private notesApiV1Service: NotesApiV1Service,
     private crypto: CryptoKeyService,
     private authService: AuthService,
     private toastMessageService: ToastMessageService,
     private dataService: DataService,
     private secureStorageService: SecureStorageService) {}


  ngOnInit(): void {
    this.initLoginForm();
  }

  initLoginForm(): void {
    this.loginForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required]],
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async login() {
    if (this.loginForm.valid) {
      this.isSaving = true;
      const loginObj: loginDto = {
        username: this.loginForm.get("email")?.value,
        password: this.loginForm.get("password")?.value,
      };

        this.authService.loginHandling(loginObj).subscribe({
        next: (response:any) => {

          if (response.response_code == 200) {
            this.secureStorageService.setItem("ssToken", response.token);
            this.secureStorageService.setItem("ssUser", JSON.stringify(response.user));

            let user = response.user;

            const bundle = {
              crypto_version: user.crypto_version,
              kdf_params: user.kdf_params,      // { algo:'PBKDF2', hash:'SHA-256', iters: 210000 }
              kdf_salt: user.kdf_salt_b64,      // base64
              eak: user.eak_b64,                // base64(IV||CT)
            };

            extractPlainEAK(loginObj.password, bundle).then(({ eakB64 }) => {
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

                  // user has app-locker enabled.
                  if(this.notesService.getDecryptedNotes() !== null) {
                      notes = this.notesService.getDecryptedNotes();
                  }

                  this.dataService.setForceDownloadOnHome(true);

                  if(notes.length == 0) {
                      this.dataService.setForceDownloadOnHome(true);
                      this.router.navigate(['/']);
                  } else {
                      console.log("what?");
                      this.notesApiV1Service
                          .upload(0, JSON.parse(notes))
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

  navigateToRegister() {
    this.router.navigate(['/profile/create-account']);
  }

  forgotPassword() {
    this.router.navigate(['/profile/forgot-password']);
  }
}
