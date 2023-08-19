import {Component, OnInit, ViewChild} from '@angular/core';
import {AlertController, IonicSafeString, ModalController, ToastController} from "@ionic/angular";
import {PasswordHelperService} from "../services/password-helper.service";
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { IonModal } from '@ionic/angular';
import {NotesService} from "../services/notes.service";
import {CryptoService} from "../services/crypto.service";
import {AppProtectorService} from "../services/app-protector.service";

@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
})
export class AppSettingsPage implements OnInit {

  public appPasswordChallenge : boolean;

  public wipeNotesOnFailedPasswords : boolean = true;

  public notesAppPassword: string;

  public confirmPassword: string;

  public passwordStrengthHelperText = "";

  private passwordStrength = 0;

  @ViewChild(IonModal) modal: IonModal;

  constructor(public alertController: AlertController,
              private toastController: ToastController,
              private modalController: ModalController,
              private noteService: NotesService,
              private cryptoService: CryptoService,
              private appProtectorService: AppProtectorService,
              private passwordHelperService: PasswordHelperService) { }

  ngOnInit() {

  }

  public getPasswordStrength() {
    return this.passwordStrength;
  }

  ionViewWillEnter() {
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
  }

  cancel() {
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
    this.modal.dismiss(null, 'cancel');
  }

  confirm() {
    this.modal.dismiss("", 'confirm');
  }

  public hasAppChallengePassword() {
    return this.noteService.appHasPasswordChallenge();
  }

  public async save() {

    if(this.notesAppPassword !== this.confirmPassword) {
      const toast = await this.toastController.create({
        message: 'The two passwords does not match.',
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();

      return;
    }

    if(this.passwordStrength < 2) {
      const toast = await this.toastController.create({
        message: 'The password is weak. Please make your password stronger.',
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();

      return;
    }

    // can be in encrypted state or decrypted - depends if the app_password_challenge is set.
    let notes = this.noteService.getNotes();

    // the note-service has password-protection, meaning the user wants to remove the password.
    if(this.noteService.appHasPasswordChallenge()) {
      // first, we have to decrypt the notes:
      let decryptedNotes = this.cryptoService.decrypt(notes, this.notesAppPassword);
      this.noteService.setNotes(decryptedNotes);
      this.noteService.setDecryptedNotes(decryptedNotes);
      await this.modal.dismiss();
      this.notesAppPassword = "";
      this.noteService.setNotesAppPassword("");
      localStorage.removeItem("app_password_challenge");

    } else {
      // encrypting notes.
      let encryptedNotes = this.cryptoService.encrypt(notes, this.notesAppPassword);
      this.noteService.setNotes(encryptedNotes);
      await this.modal.dismiss();
      this.noteService.setNotesAppPassword(this.notesAppPassword);
      this.notesAppPassword = "";
      // init protection
      this.appProtectorService.init();
      // reset failed attempts.
      this.noteService.setFailedPasswordAppAttempts(0);
      localStorage.setItem("app_password_challenge", "1");
    }


  }

  onWillDismiss(event: Event) {}

  public notesAppPasswordChange() {

    // Initialize variables
    var tips = "";

    this.passwordStrength = 0;

    if(this.notesAppPassword.length == 0) {
      this.passwordStrengthHelperText = "";
      return;
    }

    // Check password length
    if (this.notesAppPassword.length < 6) {
      tips += "Make the password longer. ";
    } else {
      this.passwordStrength += 1;
    }

    // Check for mixed case
    if (this.notesAppPassword.match(/[a-z]/) && this.notesAppPassword.match(/[A-Z]/)) {
      this.passwordStrength += 1;
    } else {
      tips += "Use both lowercase and uppercase letters. ";
    }

    // Check for numbers
    if (this.notesAppPassword.match(/\d/)) {
      this.passwordStrength += 1;
    } else {
      tips += "Include at least one number. ";
    }

    // Check for special characters
    if (this.notesAppPassword.match(/[^a-zA-Z\d]/)) {
      this.passwordStrength += 1;
    } else {
      tips += "Include at least one special character. ";
    }

    // Return results
    if (this.passwordStrength < 2) {
      this.passwordStrengthHelperText = "Easy to guess. " + tips;
    } else if (this.passwordStrength === 2) {
      this.passwordStrengthHelperText = "Medium difficulty. " + tips;
    } else if (this.passwordStrength === 3) {
      this.passwordStrengthHelperText = "Difficult. " + tips;
    } else {
      this.passwordStrengthHelperText = "Extremely difficult.x " + tips;
    }

  }

  public async appPasswordChallengeDialog() {
    await this.modal.present();
  }

  public async deleteWholeAppStorage() {
    const alert = await this.alertController.create({
      header: 'Confirm',
      subHeader: ' IF YOU CLICK ON CONFIRM, ALL NOTES WILL BE DELETED FROM YOUR DEVICE ! IT CANT BE RESTORED !',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // this.handlerMessage = 'Alert canceled';
          },
        },
        {
          text: 'Confirm',
          role: 'confirm',
          handler: () => {
            localStorage.clear();
            window.location.href = "/home";
          },
        },
      ],
    });
    await alert.present();
  }

}
