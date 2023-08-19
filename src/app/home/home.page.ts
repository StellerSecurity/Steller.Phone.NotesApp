import {Component, HostListener, inject} from '@angular/core';
import {AlertController, LoadingController, NavController, RefresherCustomEvent, ToastController} from '@ionic/angular';

import {Router} from "@angular/router";
import {CryptoService} from "../services/crypto.service";
import {NotesService} from "../services/notes.service";
import {AppProtectorService} from "../services/app-protector.service";
declare var require: any;
var CryptoJS = require('crypto-js');


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  private notes: any;

  public should_display = false;

  public checkboxOpened = false;

  public listOfCheckedCheckboxes: string[] = [];

  private alert : any = null;

  constructor(private cryptoService: CryptoService,
              private alertCtrl: AlertController,
              private noteService: NotesService,
              private navController: NavController,
              private toastController: ToastController,
              private appProtectorService: AppProtectorService,
              private loadingController: LoadingController) {}

  ionViewWillEnter() {
    if(this.noteService.shouldAskForPassword()) {
      this.askForNotesAppPassword().then(r => {});
    } else {
      this.setData(this.noteService.getNotesAppPassword()); // will send a password, if the app is encrypted.
    }
  }

  public appHasPasswordChallenge() : boolean {
    return this.noteService.appHasPasswordChallenge();
  }

  private setData(password: string = "") {

    let decryptedNotes = null;
    if(this.noteService.appHasPasswordChallenge()) {
      let notes = this.noteService.getNotes();
      decryptedNotes = this.cryptoService.decrypt(notes, password);
      this.should_display = true;
    } else {
      this.noteService.setDecryptedNotes(this.noteService.getNotes());
      decryptedNotes = this.noteService.getDecryptedNotes();
      this.should_display = true;
    }

      this.noteService.setDecryptedNotes(decryptedNotes);
      this.notes = JSON.parse(decryptedNotes);

  }

  /**
   * The method will ask the password for the notes-app (if set),
   * when the state of notes-app is either first-time opened.
   */
  public async askForNotesAppPassword() {

    // @ts-ignore
    this.alert = await this.alertCtrl.create({
      header: 'Protected Notes App',
      subHeader: 'Enter Password For The Notes App',
      inputs: [
        {
          name: 'password',
          placeholder: 'Password',
          type: 'password',
        }
      ],
      buttons: [
        {
          text: 'Reset Password',
          role: 'cancel',
          handler: () => {
            this.navController.navigateForward('reset-password');
          },
        },
        {
          text: 'Okay',
          handler: async (data: any) => {
            return this.unlockNotesApp(data);
          },
        },
      ]
    });
    await this.alert.present();

  }

  // @ts-ignore
  private async unlockNotesApp(data: any) {

    this.noteService.increaseAppNoteAttemptsFailedPasswords();
    if (this.noteService.shouldWipeAllNotesOrNot()) {
      localStorage.clear();
      // @ts-ignore
      navigator['app'].exitApp();
      return false;
    }

    this.setData(data.password); // throws error, if uncorrect PW... @TODO fix!

    // init protection
    this.appProtectorService.init();
    // store the notes app password in a service.
    this.noteService.setNotesAppPassword(data.password);
    // reset failed attempts.
    this.noteService.setFailedPasswordAppAttempts(0);

    return true;
  }

  /**
   * Will get the decrypted notes (if there is any),
   * and sort them by last modified.
   */
  getNotes()  {
    if(this.notes === undefined || this.notes === null) {
      return [];
    }

    // sort notes by last modified date.
    // @ts-ignore
    this.notes = this.notes.sort((a, b) => {
      if (a.last_modified > b.last_modified) {
        return -1;
      }
    });

    return this.notes;
  }

  public settings(type: string = "") {
    this.navController.navigateForward('app-settings').then(r => {});
  }

  public openOrCheckbox(note_id: string) {
    if(!this.checkboxOpened) {
      this.navController.navigateForward('/note/' + note_id).then(r => {});
    }
  }

  public toggleCheckbox() {
    this.checkboxOpened = !this.checkboxOpened;
    if(!this.checkboxOpened) {
      this.listOfCheckedCheckboxes = [];
    }
  }

  public async deleteSelectedNotes() {
    let alert = await this.alertCtrl.create({
      header: 'Confirm',
      subHeader: 'Please confirm that you want to delete the selected notes. They cannot be recovered once deleted.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // this.handlerMessage = 'Alert canceled';
          },
        },
        {
          text: 'Delete',
          role: 'confirm',
          handler: async () => {
            await this.deleteNotesConfirm();
          },
        },
      ],
    });
    await alert.present();
  }

  /**
   * Being called, when the confirmation has been done.
   * @private
   */
  private async deleteNotesConfirm() {

    const loading = await this.loadingController.create();
    loading.present();

    // delete the selected notes.
    for (let i = 0; this.listOfCheckedCheckboxes.length > i; i++) {
      for (let j = this.notes.length - 1; j >= 0; j--) {
        if (this.listOfCheckedCheckboxes[i] == this.notes[j].id) {
          console.log(this.listOfCheckedCheckboxes[i] + " " + this.notes[j].id);
          this.notes.splice(j, 1);
        }
      }
    }

    if (this.noteService.appHasPasswordChallenge()) {
      // newly notes to save into storage.
      let encryptedNotesSave = this.cryptoService.encrypt(JSON.stringify(this.notes), this.noteService.getNotesAppPassword());
      // notes in the app is stored.
      localStorage.setItem("app_password_challenge", "1");
      // update notes, and store.
      this.noteService.setNotes(encryptedNotesSave);
    } else {
      this.noteService.setNotes(JSON.stringify(this.notes));
    }

    this.toggleCheckbox();
    const toast = await this.toastController.create({
      message: 'The selected notes has been deleted.',
      duration: 2500,
      position: 'bottom',
    });

    await toast.present();
    await loading.dismiss();
  }

  /**
   * Listens on Keyboard events.
   * Used for the unlock-app.
   * @param event
   */
  @HostListener('document:keyup', ['$event'])
  async onKeyUp(event: KeyboardEvent) {
    if (this.alert !== null && event.key.toUpperCase() == "ENTER") {
      await this.unlockNotesApp(null);
    }
  }

  /**
   * Selecting notes that the user has chosen in UI.
   * @param event
   * @param note_id
   */
  public selectNote(event: any, note_id: string) {
    var isChecked = event.currentTarget.checked;
    // checked.
    if(!isChecked) {
      this.listOfCheckedCheckboxes.push(note_id);
    } else { // removed.
      for(let i = 0; this.listOfCheckedCheckboxes.length > i; i++) {
        if(this.listOfCheckedCheckboxes[i] == note_id) {
          this.listOfCheckedCheckboxes.splice(i, 1);
        }
      }
    }
  }
}
