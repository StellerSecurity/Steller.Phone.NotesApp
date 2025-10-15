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
import {SecureStorageService} from "../services/secure-storage.service";
@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
})
export class AppSettingsPage implements AfterViewInit {

  public appPasswordChallenge: boolean;

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
    private secureStorageService: SecureStorageService,
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

    // can be in encrypted state or decrypted - depends on if the app_password_challenge is set.
    let notes = this.noteService.getNotes();

    // in case user creates app-password, and there is no notes.
    if (notes === null) {
      notes = JSON.stringify([]);
    }

    let eakB64 = await this.secureStorageService.getItem('ssEakB64');
    if (eakB64) {
      eakB64 = this.cryptoService.encrypt(eakB64, this.notesAppPassword);
      // @ts-ignore
      await this.secureStorageService.setItem("ssEakB64_Encrypted", eakB64);
      // remove the unencrypted one.
      await this.secureStorageService.removeItem("ssEakB64");

      console.log("Removed unencrypted eak, and made a encrypted one." + eakB64);
    }

    // first, we have to decrypt the notes:
    let encryptedNotes = this.cryptoService.encrypt(notes, this.notesAppPassword);
    this.noteService.setNotes(encryptedNotes);
    await this.modal.dismiss();
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
                        // first, we have to decrypt the notes:
                        let decryptedNotes = null;
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

                        let eakB64 = await this.secureStorageService.getItem('ssEakB64_Encrypted');
                        if (eakB64) {
                            eakB64 = this.cryptoService.decrypt(eakB64, inputValue);
                            // @ts-ignore
                            await this.secureStorageService.setItem("ssEakB64", eakB64);
                            // remove the encrypted one.
                            await this.secureStorageService.removeItem("ssEakB64_Encrypted");
                        }

                        this.noteService.setNotes(decryptedNotes);
                        this.noteService.setDecryptedNotes(decryptedNotes);
                        await this.modal.dismiss();
                        this.notesAppPassword = "";
                        this.confirmPassword = "";
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

}
