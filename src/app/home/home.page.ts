import {Component, ViewChild} from '@angular/core';
import {
  AlertController, IonModal,
  LoadingController,
  ModalController,
  NavController,
  ToastController,
} from '@ionic/angular';

import {CryptoService} from "../services/crypto.service";
import {NotesService} from "../services/notes.service";
import {AppProtectorService} from "../services/app-protector.service";
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import { ResetPassModalComponent } from '../restpass-modal/resetpass-modal.component';
declare var require: any;

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  private notes: any;

  public should_display = true;

  public checkboxOpened = false;

  public listOfCheckedCheckboxes: string[] = [];

  public app_requires_password = false;
  public showPassword = false;

  public input_password_app_unlock = "";

  public timezone = "UTC";

  @ViewChild(IonModal) modal: IonModal;

  constructor(private cryptoService: CryptoService,
              private alertCtrl: AlertController,
              private noteService: NotesService,
              private navController: NavController,
              private toastController: ToastController,
              private appProtectorService: AppProtectorService,
              private modalCtrl: ModalController,
              private loadingController: LoadingController) {}

  ionViewWillEnter() {

    this.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if(this.noteService.shouldAskForPassword()) {
      this.should_display = false;
    } else {
      this.setData(this.noteService.getNotesAppPassword()); // will send a password, if the app is encrypted.
    }

  }

  public appHasPasswordChallenge() : boolean {
    return this.noteService.appHasPasswordChallenge();
  }

  private setData(password: string = ""): boolean {

    console.log("DECRYPTED..");
    let decryptedNotes = null;
    if(this.noteService.appHasPasswordChallenge()) {
      let notes = this.noteService.getNotes();
      decryptedNotes = this.cryptoService.decrypt(notes, password);
    } else {
      this.noteService.setDecryptedNotes(this.noteService.getNotes());
      decryptedNotes = this.noteService.getNotes();
    }

    // @ts-ignore
    if(decryptedNotes.length == 0 && this.noteService.appHasPasswordChallenge()) {
      console.log("fail..");
      return false;
    }


      this.noteService.setDecryptedNotes(decryptedNotes);
      // @ts-ignore
      this.notes = JSON.parse(decryptedNotes);

      return true;

  }

  public togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  // @ts-ignore
  public async unlockNotesApp() {

    this.noteService.increaseAppNoteAttemptsFailedPasswords();
    if (this.noteService.shouldWipeAllNotesOrNot()) {
      localStorage.clear();
      // @ts-ignore
      navigator['app'].exitApp();
      return false;
    }

    let shouldUnlock = this.setData(this.input_password_app_unlock);

    if(shouldUnlock) {
      this.should_display = true;
      // init protection
      this.appProtectorService.init();
      // store the notes app password in a service.
      this.noteService.setNotesAppPassword(this.input_password_app_unlock);
      // reset failed attempts.
      this.noteService.setFailedPasswordAppAttempts(0);
    } else {
      const toast = await this.toastController.create({
        message: 'The password is not correct. Try again.',
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();
      return false;
    }

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

    for(let i = 0; i < this.notes.length; i++){
      let note = this.notes[i];
      note.text = note.text.replace(/<[^>]*>/g, '');
    }

    // @ts-ignore
    this.notes = this.notes.sort((a, b) => b.last_modified - a.last_modified);

    return this.notes;
  }

  public settings() {
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

  /*public async deleteSelectedNotes() {
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
  }*/


  public async deleteSelectedNotes() {
    // @ts-ignore
    const modal = await this.modalCtrl.create({
      component: DeleteNoteModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
          await this.deleteNotesConfirm();
        } else {
          // Handle case when user cancels password input
        }
      }
    });

    return await modal.present();

  }

  /**
   * Being called, when the confirmation has been done.
   * @private
   */
  private async deleteNotesConfirm() {

    const loading = await this.loadingController.create();
    await loading.present();

    // delete the selected notes.
    for (let i = 0; this.listOfCheckedCheckboxes.length > i; i++) {
      for (let j = this.notes.length - 1; j >= 0; j--) {
        if (this.listOfCheckedCheckboxes[i] == this.notes[j].id) {
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

    this.setData(this.input_password_app_unlock);

    this.toggleCheckbox();
    const toast = await this.toastController.create({
      message: 'The selected notes has been deleted.',
      duration: 2500,
      position: 'bottom',
    });

    await toast.present();
    await loading.dismiss();
  }

  public async resetPassword() {

    // @ts-ignore
    const modal = await this.modalCtrl.create({
      component: ResetPassModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
          localStorage.clear();
          this.app_requires_password = false;
          window.location.href='/home';
        } else {
          // Handle case when user cancels password input
        }
      }
    });

    return await modal.present();
    /*
    const alert = await this.alertCtrl.create({
      header: 'WARNING',
      subHeader: 'PLEASE CONFIRM THAT YOU WANT TO THE RESET PASSWORD. IF YOU CONFIRM ALL NOTES STORED WILL BE DELETED ON YOUR DEVICE AND CANT BE RECOVERED !',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // do nothing.
          },
        },
        {
          text: 'OK',
          role: 'confirm',
          handler: () => {
            localStorage.clear();
            this.app_requires_password = false;
            window.location.href='/home';
          },
        }]
    });

    await alert.present();
    */
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

  /**
   * Will detect if the user presses enter on unlock notes-app.
   * @param ev
   */
  public ionInputAppUnlockInput(ev: any) {
    if(ev.key == "Enter") {
      this.unlockNotesApp().then(r => {});
    }
  }

}
