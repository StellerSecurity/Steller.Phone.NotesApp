import { Component, OnInit, ViewChild } from '@angular/core';
import { AlertController, ModalController, ToastController, NavController } from "@ionic/angular";
import { PasswordHelperService } from "../services/password-helper.service";
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { IonModal } from '@ionic/angular';
import { NotesService } from "../services/notes.service";
import { CryptoService } from "../services/crypto.service";
import { AppProtectorService } from "../services/app-protector.service";
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
})
export class AppSettingsPage implements OnInit {

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

  @ViewChild(IonModal) modal: IonModal;

  constructor(public alertController: AlertController,
    private toastController: ToastController,
    private noteService: NotesService,
    private cryptoService: CryptoService,
    private appProtectorService: AppProtectorService,
    private navController: NavController,
    private modalCtrl: ModalController,
    private passwordHelperService: PasswordHelperService) { }

  ngOnInit() { }

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

    if (this.notesAppPassword !== this.confirmPassword) {
      const toast = await this.toastController.create({
        message: 'The two passwords does not match.',
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();

      return;
    }

    if (this.notesAppPassword.length < 2) {
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
    if (this.noteService.appHasPasswordChallenge()) {
      // first, we have to decrypt the notes:
      let decryptedNotes = this.cryptoService.decrypt(notes, this.notesAppPassword);
      this.noteService.setNotes(decryptedNotes);
      this.noteService.setDecryptedNotes(decryptedNotes);
      await this.modal.dismiss();
      this.notesAppPassword = "";
      this.confirmPassword = "";
      this.noteService.setNotesAppPassword("");
      localStorage.removeItem("app_password_challenge");
      window.location.href = "/app-settings";
    } else {

      if(notes === null) {
        notes = JSON.stringify([]);
      }

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
      window.location.href = "/app-settings";
    }


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
            let decryptedNotes = this.cryptoService.decrypt(notes, inputValue);
            this.noteService.setNotes(decryptedNotes);
            this.noteService.setDecryptedNotes(decryptedNotes);
            await this.modal.dismiss();
            this.notesAppPassword = "";
            this.confirmPassword = "";
            this.noteService.setNotesAppPassword("");
            localStorage.removeItem("app_password_challenge");
            window.location.href = "/app-settings";
          }else{
            const toast = await this.toastController.create({
              message: 'Enter your current password',
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

    // Initialize variables
    var tips = "";

    this.passwordStrength = 0;

    if (this.notesAppPassword.length == 0) {
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
      this.upperLower = true;
    } else {
      tips += "Use both lowercase and uppercase letters. ";
      this.upperLower = false;
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
      this.specialChar = true;
    } else {
      tips += "Include at least one special character. ";
      this.specialChar = false;
    }

    // Check password length
    if (this.notesAppPassword.length >= 6) {
      this.passwordStrength += 1;
      this.strongPass = true;
    } else {
      tips += "Password should have at least 6 characters. ";
      this.strongPass = false;
    }


    // Return results
    if (this.passwordStrength < 2) {
      this.passwordStrengthHelperText = "Weak Password!";
    } else if (this.passwordStrength === 2) {
      this.passwordStrengthHelperText = "Average Password!";
    } else if (this.passwordStrength === 3) {
      this.passwordStrengthHelperText = "Good Password!";
    } else {
      this.passwordStrengthHelperText = "Great Password!";
    }

    // Return results
    /* if (this.passwordStrength < 2) {
       this.passwordStrengthHelperText = "Easy to guess. " + tips;
     } else if (this.passwordStrength === 2) {
       this.passwordStrengthHelperText = "Medium difficulty. " + tips;
     } else if (this.passwordStrength === 3) {
       this.passwordStrengthHelperText = "Difficult. " + tips;
     } else {
       this.passwordStrengthHelperText = "Extremely difficult.x " + tips;
     }*/

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
          window.location.href = "/home";
        } else {
          // Handle case when user cancels password input
        }
      }
    });

    return await modal.present();

    /*const alert = await this.alertController.create({
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
            // @ts-ignore
            //navigator['app'].exitApp();
          },
        },
      ],
    });
    await alert.present();*/

  }

}
