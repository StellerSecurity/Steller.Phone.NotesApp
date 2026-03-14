import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { AlertController, ModalController, ToastController, NavController } from "@ionic/angular";
import { IonModal } from '@ionic/angular';

import { NotesService } from "../services/notes.service";
import { CryptoService } from "../services/crypto.service";
import { AppProtectorService } from "../services/app-protector.service";
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import { TranslatorService } from '../services/translator.service';
import {
  CryptoKeyService,
} from "../services/crypto-key.service";
import { SecureStorageService } from "../services/secure-storage.service";
import { evaluatePasswordStrength, isPasswordLongEnough } from '../utils/password-policy';

@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
})
export class AppSettingsPage implements AfterViewInit {

  public appPasswordChallenge: boolean;
  public notesAppPassword: string = '';
  public confirmPassword: string = '';

  public passwordStrengthHelperText = "";
  public passwordStrength = 0;

  public password_enabled = false;
  public showPassword = false;
  public confirmShowPassword = false;
  public upperLower = false;
  public specialChar = false;
  public strongPass = false;
  public allTranslations: any;
  public appLockTimeoutMinutes = 60;
  public readonly appLockTimeoutOptions = [1, 5, 15, 30, 60];

  @ViewChild(IonModal) modal: IonModal;

  constructor(
    private toastController: ToastController,
    private noteService: NotesService,
    private cryptoService: CryptoService,
    private appProtectorService: AppProtectorService,
    private navController: NavController,
    private modalCtrl: ModalController,
    private secureStorageService: SecureStorageService,
    private translatorService: TranslatorService
  ) { }

  ionViewWillEnter(): void {
    this.allTranslations = this.translatorService.allTranslations;
    this.appLockTimeoutMinutes = this.noteService.getAppLockTimeoutMinutes();
  }

  ionViewDidEnter() {
    this.passwordStrengthHelperText = this.allTranslations.passwordAtLeastLength;
  }

  ngAfterViewInit() {
    if (this.noteService.appHasPasswordChallenge()) {
      this.password_enabled = true;
    }
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
    this.appLockTimeoutMinutes = this.noteService.getAppLockTimeoutMinutes();
  }

  cancel() {
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
    this.modal.dismiss(null, 'cancel');
  }

  confirm() {
    this.modal.dismiss("", 'confirm');
  }

  public togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  public toggleConfirmPasswordVisibility() {
    this.confirmShowPassword = !this.confirmShowPassword;
  }

  public async save() {

    if (!isPasswordLongEnough(this.notesAppPassword)) {
      const toast = await this.toastController.create({
        message: this.allTranslations.thePasswordIsWeakPleaseMakeYourPasswordStronger,
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();
      return;
    }

    if (this.notesAppPassword !== this.confirmPassword) {
      const toast = await this.toastController.create({
        message: this.allTranslations.theTwoPasswordsDoesNotMatch,
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();
      return;
    }

    // can be in encrypted state or decrypted - depends on if the app_password_challenge is set.
    let notes = this.noteService.getNotes();

    // in case user creates app-password, and there is no notes.
    if (notes === null) {
      notes = JSON.stringify([]);
    }

    // Wrap EAK with notes app password (store encrypted EAK, remove plaintext)
    const existingEak = await this.secureStorageService.getItem('ssEakB64');
    if (existingEak != null) {
      const wrappedEak = this.cryptoService.encrypt(existingEak, this.notesAppPassword);

      await this.secureStorageService.setItem("ssEakB64_Encrypted", wrappedEak);
      await this.secureStorageService.removeItem("ssEakB64");
    }

    // first, we have to decrypt the notes (if they were encrypted before),
    // and then encrypt them with the new app password.
    const encryptedNotes = this.cryptoService.encrypt(notes, this.notesAppPassword);
    this.noteService.setNotes(encryptedNotes);

    await this.modal.dismiss();
    this.noteService.setAppLockTimeoutMinutes(this.appLockTimeoutMinutes);
    this.noteService.clearAppUnlockFailures();
    this.noteService.setNotesAppPassword(this.notesAppPassword);
    this.notesAppPassword = "";
    this.confirmPassword = "";
    localStorage.setItem("app_password_challenge", "1");
    window.location.href = "/app-settings";
    this.password_enabled = false;
  }

  public async removePassword() {
    const modal = await this.modalCtrl.create({
      component: ConfirmationModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm, inputValue } = data.data;
        if (confirm) {
          if (this.noteService.appHasPasswordChallenge() && inputValue) {

            let notes = this.noteService.getNotes();
            let decryptedNotes: string | null = null;

            try {
              decryptedNotes = this.cryptoService.decrypt(notes, inputValue);
            } catch (e) {
              const toast = await this.toastController.create({
                message: 'The entered password was not correct.',
                duration: 3000,
                position: 'bottom',
              });

              await toast.present();
              return;
            }

            // Decrypt wrapped EAK back to plain EAK
            const encEak = await this.secureStorageService.getItem('ssEakB64_Encrypted');
            if (encEak != null) {
              const plainEak = this.cryptoService.decrypt(encEak, inputValue);

              await this.secureStorageService.setItem("ssEakB64", plainEak);
              await this.secureStorageService.removeItem("ssEakB64_Encrypted");
            }

            this.noteService.setNotes(decryptedNotes);
            this.noteService.setDecryptedNotes(decryptedNotes);

            await this.modal.dismiss();
            this.notesAppPassword = "";
            this.confirmPassword = "";
            this.noteService.clearAppUnlockFailures();
            this.noteService.setNotesAppPassword("");
            localStorage.removeItem("app_password_challenge");
            window.location.href = "/app-settings";
          } else {
            const toast = await this.toastController.create({
              message: this.allTranslations.enterYourCurrentPassword,
              duration: 3000,
              position: 'bottom',
            });
            await toast.present();
          }
        } else {
          // cancelled
        }
      }
    });

    return await modal.present();
  }

  public notesAppPasswordChange() {
    const strength = evaluatePasswordStrength(this.notesAppPassword);

    this.passwordStrength = strength.score;
    this.upperLower = strength.upperLower;
    this.specialChar = strength.specialChar;
    this.strongPass = strength.strongPass;
    this.passwordStrengthHelperText =
      this.allTranslations?.[strength.helperKey] ?? '';
  }


  public saveAppLockTimeout() {
    this.noteService.setAppLockTimeoutMinutes(this.appLockTimeoutMinutes);
  }

  public getAppLockTimeoutLabel(minutes: number): string {
    if (minutes === 1) {
      return 'After 1 minute';
    }

    return `After ${minutes} minutes`;
  }

  public async appPasswordChallengeDialog() {
    await this.modal.present();
  }
}
