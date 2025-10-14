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
} from "../../services/crypto-key.service";
import {firstValueFrom} from "rxjs";
import { SecureStorageService } from 'src/app/services/secure-storage.service';
import {DataService} from "../../services/data.service";
import {CryptoService} from "../../services/crypto.service";

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
              private cryptoService: CryptoService,
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

      try {
        const response: any = await firstValueFrom(this.authService.loginHandling(loginObj));

        if (response.response_code == 200) {
          await this.secureStorageService.setItem("ssToken", response.token);
          await this.secureStorageService.setItem("ssUser", JSON.stringify(response.user));

          let user = response.user;

          const bundle = {
            crypto_version: user.crypto_version,
            kdf_params: user.kdf_params,      // { algo:'PBKDF2', hash:'SHA-256', iters: 210000 }
            kdf_salt: user.kdf_salt_b64,      // base64
            eak: user.eak_b64,                // base64(IV||CT)
          };

          const { eakB64: derivedEakB64 } = await extractPlainEAK(loginObj.password, bundle);
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
            await this.router.navigate(['/']);
          } else {
            try {
              await this.notesApiV1Service.upload(0, JSON.parse(notes));
              console.log('Notes sent.');
            } catch (err) {
              console.log("notes error.", err);
            } finally {
              await this.router.navigate(['/']);
            }
          }
        } else {
          await this.toastMessageService.showError(response.response_message);
        }
      } catch (error: any) {
        await this.toastMessageService.showError(error?.error?.message || error?.message);
      } finally {
        this.isSaving = false;
        this.authService.initializeAuthState();
      }
    }
  }

  navigateToRegister() {
    this.router.navigate(['/profile/create-account']);
  }

  forgotPassword() {
    this.router.navigate(['/profile/forgot-password']);
  }
}
