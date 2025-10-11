import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { AlertController, ModalController, ToastController, NavController } from "@ionic/angular";
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { IonModal } from '@ionic/angular';
import { NotesService } from "../services/notes.service";
import { CryptoService } from "../services/crypto.service";
import { AppProtectorService } from "../services/app-protector.service";
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import { TranslatorService } from '../services/translator.service';
import {
    CryptoKeyService, saveWrappedBundle,
    wrapBundleWithPassword,
    wrapBundleWithPassword_WebCrypto
} from "../services/crypto-key.service";
@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
})
export class AppSettingsPage implements AfterViewInit {

  public appPasswordChallenge: boolean;

  public wipeNotesOnFailedPasswords: boolean = true;

  public notesAppPassword: string;

  public confirmPassword: string;

  public passwordStrengthHelperText = "";

  public passwordStrength = 0;

  public password_enabled = false;
  public showPassword = false;
  public confirmShowPassword = false;
  public upperLower = false;
  public specialChar = false;
  public strongPass = false;
  allTranslations:any;

  @ViewChild(IonModal) modal: IonModal;

  constructor(public alertController: AlertController,
    private toastController: ToastController,
    private noteService: NotesService,
    private cryptoService: CryptoService,
    private appProtectorService: AppProtectorService,
    private navController: NavController,
    private crypto: CryptoKeyService,
    private modalCtrl: ModalController,
    private translatorService: TranslatorService) { }

  ionViewWillEnter(): void {
    this.allTranslations = this.translatorService.allTranslations;
  }

  ionViewDidEnter() {
    this.passwordStrengthHelperText = this.allTranslations.passwordAtLeastLength;
 }

  ngAfterViewInit() {
    if (this.noteService.appHasPasswordChallenge()) {
      this.password_enabled = true;
    }
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
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

    if (this.notesAppPassword.length < 3) {
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
    // @ts-ignore
    let bundle = localStorage.getItem("bundle");
    // @ts-ignore
    const wrapped = await wrapBundleWithPassword_WebCrypto(this.notesAppPassword, bundle);
    await saveWrappedBundle(wrapped);

    // first, we have to decrypt the notes:
    this.notesAppPassword = "";
    this.confirmPassword = "";
    this.noteService.setNotesAppPassword("");
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
            await this.modal.dismiss();
            this.noteService.setNotesAppPassword("");
            localStorage.removeItem("app_password_challenge");
            window.location.href = "/app-settings";
          }
      }
    });

    return await modal.present();
  }

  public notesAppPasswordChange() {

    this.passwordStrength = 0;

    if (this.notesAppPassword.length == 0) {
      this.passwordStrengthHelperText = this.allTranslations.passwordAtLeastLength;
      return;
    }

    // Check password length
    if (this.notesAppPassword.length > 6) {
      this.passwordStrength += 1;
    }

    // Check for mixed case
    if (this.notesAppPassword.match(/[a-z]/) && this.notesAppPassword.match(/[A-Z]/)) {
      this.passwordStrength += 1;
      this.upperLower = true;
    } else {
      this.upperLower = false;
    }

    // Check for numbers
    if (this.notesAppPassword.match(/\d/)) {
      this.passwordStrength += 1;
    }

    // Check for special characters
    if (this.notesAppPassword.match(/[^a-zA-Z\d]/)) {
      this.passwordStrength += 1;
      this.specialChar = true;
    } else {
      this.specialChar = false;
    }

    // Check password length
    if (this.notesAppPassword.length >= 6) {
      this.passwordStrength += 1;
      this.strongPass = true;
    } else {
      this.strongPass = false;
    }


    // Return results
    if (this.passwordStrength < 2) {
      this.passwordStrengthHelperText = this.allTranslations.weakPassword;
    } else if (this.passwordStrength === 2) {
      this.passwordStrengthHelperText = this.allTranslations.averagePassword;
    } else if (this.passwordStrength === 3) {
      this.passwordStrengthHelperText = this.allTranslations.goodPassword;
    } else {
      this.passwordStrengthHelperText = this.allTranslations.greatPassword;
    }

  }

  public async appPasswordChallengeDialog() {
    await this.modal.present();
  }

  public async deleteWholeAppStorage() {

    const modal = await this.modalCtrl.create({
      component: DeleteNoteModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
          localStorage.clear();
          window.location.href = "/";
        } else {
          // Handle case when user cancels password input
        }
      }
    });

    return await modal.present();

  }

}
