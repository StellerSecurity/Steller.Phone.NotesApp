import { Component, OnInit, ViewChild } from '@angular/core';
import {
  AlertController,
  ModalController,
  ToastController,
  NavController,
} from '@ionic/angular';
import { PasswordHelperService } from '../services/password-helper.service';
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { IonModal } from '@ionic/angular';
import { NotesService } from '../services/notes.service';
import { CryptoService } from '../services/crypto.service';
import { AppProtectorService } from '../services/app-protector.service';

@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
})
export class AppSettingsPage implements OnInit {
  public appPasswordChallenge: boolean;

  public tempPasswordChallenge: boolean;

  public wipeNotesOnFailedPasswords: boolean = true;

  public notesAppPassword: string;

  public confirmPassword: string;

  public passwordStrengthHelperText = '';

  private passwordStrength = 0;

  @ViewChild(IonModal) modal: IonModal;

  constructor(
    public alertController: AlertController,
    private toastController: ToastController,
    private noteService: NotesService,
    private cryptoService: CryptoService,
    private appProtectorService: AppProtectorService,
    private passwordHelperService: PasswordHelperService,
    private navController: NavController
  ) {}

  ngOnInit() {}

  ionViewWillEnter() {
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
  }

  cancel() {
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
    this.notesAppPassword = '';
    this.confirmPassword = '';
    this.passwordStrengthHelperText = '';
    this.modal.dismiss(null, 'cancel');
  }

  confirm() {
    this.modal.dismiss('', 'confirm');
  }

  public hasAppChallengePassword() {
    return this.noteService.appHasPasswordChallenge();
  }

  public async save() {
    console.log('confirmed');

    // can be in encrypted state or decrypted - depends if the app_password_challenge is set.
    let notes = this.noteService.getNotes();

    console.log(this.tempPasswordChallenge);
    // the note-service has password-protection, meaning the user wants to remove the password.
    if (
      this.noteService.appHasPasswordChallenge() &&
      !this.tempPasswordChallenge
    ) {
      // first, we have to decrypt the notes:
      try {
        let decryptedNotes = this.cryptoService.decrypt(
          notes,
          this.confirmPassword
        );

        this.noteService.setNotes(decryptedNotes);
        this.noteService.setDecryptedNotes(decryptedNotes);
        await this.modal.dismiss();
        this.notesAppPassword = '';
        this.noteService.setNotesAppPassword('');
        localStorage.removeItem('app_password_challenge');

        this.appPasswordChallenge = false;
      } catch (e) {
        const toast = await this.toastController.create({
          message: 'The password is not correct. Try again.',
          duration: 3000,
          position: 'bottom',
        });

        await toast.present();
        return;
      }
    } else if (this.tempPasswordChallenge) {
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

      if (notes === null) {
        notes = JSON.stringify([]);
      }

      // encrypting notes.
      let encryptedNotes = this.cryptoService.encrypt(
        notes,
        this.notesAppPassword
      );
      this.noteService.setNotes(encryptedNotes);
      await this.modal.dismiss();
      this.noteService.setNotesAppPassword(this.notesAppPassword);
      this.notesAppPassword = '';
      // init protection
      this.appProtectorService.init();
      // reset failed attempts.
      this.noteService.setFailedPasswordAppAttempts(0);
      localStorage.setItem('app_password_challenge', '1');

      this.appPasswordChallenge = true;
    }
  }

  public async appPasswordChallengeDialog($event: boolean) {
    this.tempPasswordChallenge = $event;

    if (this.tempPasswordChallenge !== this.appPasswordChallenge)
      await this.modal.present();
  }

  handleInputChange(value: string, type: string) {
    switch (type) {
      case 'password':
        this.notesAppPassword = value;
        break;
      case 'confirm-password':
        this.confirmPassword = value;
        break;
    }
  }

  public async deleteWholeAppStorage() {
    const alert = await this.alertController.create({
      header: 'Confirm',
      subHeader:
        ' IF YOU CLICK ON CONFIRM, ALL NOTES WILL BE DELETED FROM YOUR DEVICE ! IT CANT BE RESTORED !',
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
            window.location.href = '/home';
            // @ts-ignore
            navigator['app'].exitApp();
          },
        },
      ],
    });
    await alert.present();
  }

  public handleOnBack() {
    this.navController.back();
  }
}
