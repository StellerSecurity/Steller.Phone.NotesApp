import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { AlertController, IonModal, IonSelect, ModalController, ToastController } from "@ionic/angular";

import { NotesService } from "../services/notes.service";
import { CryptoService } from "../services/crypto.service";
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';
import { TranslatorService } from '../services/translator.service';
import { SecureStorageService } from "../services/secure-storage.service";
import { evaluatePasswordStrength, isPasswordLongEnough } from '../utils/password-policy';
import { ScreenshotProtectionService } from '../services/screenshot-protection.service';

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
  public readonly appLockTimeoutOptions = [1, 5, 15, 30, 60, 120];

  public screenshotProtectionEnabled = true;

  public appWipeAfterDays = 0;
  public readonly appWipeAfterDaysOptions = [0, 7, 14, 28, 30, 60, 90];

  @ViewChild(IonModal) modal: IonModal;
  @ViewChild('autoLockSelect') autoLockSelect!: IonSelect;
  @ViewChild('wipeSelect') wipeSelect!: IonSelect;

  constructor(
    private toastController: ToastController,
    private alertController: AlertController,
    private noteService: NotesService,
    private cryptoService: CryptoService,
    private modalCtrl: ModalController,
    private secureStorageService: SecureStorageService,
    private translatorService: TranslatorService,
    private screenshotProtectionService: ScreenshotProtectionService
  ) {}

  async ionViewWillEnter(): Promise<void> {
    this.allTranslations = this.translatorService.allTranslations;
    this.appLockTimeoutMinutes = this.noteService.getAppLockTimeoutMinutes();
    this.appWipeAfterDays = this.noteService.getAppWipeAfterDays();
    this.screenshotProtectionEnabled = await this.screenshotProtectionService.isEnabled();
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
    this.appWipeAfterDays = this.noteService.getAppWipeAfterDays();
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

    let notes = this.noteService.getNotes();

    if (notes === null) {
      notes = JSON.stringify([]);
    }

    const existingEak = await this.secureStorageService.getItem('ssEakB64');
    if (existingEak != null) {
      const wrappedEak = this.cryptoService.encrypt(existingEak, this.notesAppPassword);

      await this.secureStorageService.setItem("ssEakB64_Encrypted", wrappedEak);
      await this.secureStorageService.removeItem("ssEakB64");
    }

    const encryptedNotes = this.cryptoService.encrypt(notes, this.notesAppPassword);
    this.noteService.setNotes(encryptedNotes);

    await this.modal.dismiss();
    this.noteService.setAppLockTimeoutMinutes(this.appLockTimeoutMinutes);
    this.noteService.setAppWipeAfterDays(this.appWipeAfterDays);
    this.noteService.clearAppUnlockFailures();
    this.noteService.setNotesAppPassword(this.notesAppPassword);
    this.noteService.setAppPasswordChallengeEnabled(true);
    this.password_enabled = true;

    await this.screenshotProtectionService.applyCurrentSetting(true);

    this.notesAppPassword = "";
    this.confirmPassword = "";
    window.location.reload();
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
                message: this.allTranslations.enteredPasswordIncorrect,
                duration: 3000,
                position: 'bottom',
              });

              await toast.present();
              return;
            }

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
            this.appWipeAfterDays = 0;
            this.noteService.clearAppUnlockFailures();
            this.noteService.setNotesAppPassword("");
            this.noteService.setAppPasswordChallengeEnabled(false);
            this.password_enabled = false;
            await this.screenshotProtectionService.applyCurrentSetting(false);
            window.location.reload();
          } else {
            const toast = await this.toastController.create({
              message: this.allTranslations.enterYourCurrentPassword,
              duration: 3000,
              position: 'bottom',
            });
            await toast.present();
          }
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

  public async screenshotProtectionChange() {
    await this.screenshotProtectionService.setEnabled(this.screenshotProtectionEnabled);
    await this.screenshotProtectionService.applyCurrentSetting(this.password_enabled);
  }

  public getAppLockTimeoutLabel(minutes: number): string {
    if (minutes === 1) {
      return this.allTranslations.autoLockAfterOneMinute;
    }

    return `${this.allTranslations.autoLockAfter} ${minutes} ${this.allTranslations.minutes}`;
  }

  public async saveAppWipeAfterDays() {
    const previous = this.noteService.getAppWipeAfterDays();

    if (this.appWipeAfterDays > 0 && previous === 0) {
      const alert = await this.alertController.create({
        header: this.allTranslations.enableInactiveDeviceWipeTitle,
        message: this.allTranslations.enableInactiveDeviceWipeMessage,
        buttons: [
          {
            text: this.allTranslations.cancel,
            role: 'cancel',
            handler: () => {
              this.appWipeAfterDays = previous;
            },
          },
          {
            text: this.allTranslations.enableWipe,
            role: 'confirm',
            handler: () => {
              this.noteService.setAppWipeAfterDays(this.appWipeAfterDays);
              if (this.noteService.getLastSuccessfulAppUnlockAt() === 0) {
                this.noteService.recordSuccessfulAppUnlock();
              }
            },
          },
        ],
      });

      await alert.present();
      return;
    }

    this.noteService.setAppWipeAfterDays(this.appWipeAfterDays);

    if (this.appWipeAfterDays > 0 && this.noteService.getLastSuccessfulAppUnlockAt() === 0) {
      this.noteService.recordSuccessfulAppUnlock();
    }
  }

  public getAppWipeAfterDaysLabel(days: number): string {
    if (days === 0) {
      return this.allTranslations.off;
    }

    if (days === 1) {
      return this.allTranslations.afterOneDay;
    }

    return `${this.allTranslations.after} ${days} ${this.allTranslations.days}`;
  }

  public async appPasswordChallengeDialog() {
    await this.modal.present();
  }

  public openAutoLockSelect() {
    this.autoLockSelect?.open();
  }

  public openWipeSelect() {
    this.wipeSelect?.open();
  }

  public async toggleScreenshotProtectionFromRow() {
    this.screenshotProtectionEnabled = !this.screenshotProtectionEnabled;
    await this.screenshotProtectionChange();
  }
}
