import { Component, ViewChild } from '@angular/core';
import {
  AlertController,
  IonModal,
  LoadingController,
  ModalController,
  NavController,
  ToastController,
} from '@ionic/angular';
import { ExpireService } from '../services/expire.service';

import { CryptoService } from '../services/crypto.service';
import { NotesService } from '../services/notes.service';
import { AppProtectorService } from '../services/app-protector.service';
import { INote, IColor, EExpiredDate } from '../types';
@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  private notes: INote[];

  private __notes: INote[];

  public headerTitle: string = 'My Notes';

  public should_display = true;

  public checkboxOpened = false;

  public listOfCheckedCheckboxes: Set<string>;

  public app_requires_password = false;

  public input_password_app_unlock = '';

  public isDeleteModalOpen = false;

  public search: string = '';

  public deleteConfirm: {
    title: string;
    text: string;
    button1: {
      label: string;
      color: IColor;
    };
    button2: {
      label: string;
      color: IColor;
    };
  } = {
    title: 'Are you sure?',
    text: 'You want to delete Notes? This action cannot be undone.',
    button1: {
      label: 'CANCEL',
      color: 'note-primary',
    },
    button2: {
      label: 'DELETE',
      color: 'note-danger',
    },
  };

  public checkedIds: Set<string>;

  private deleteExpireTimer: any = null;

  private count = 0;

  @ViewChild(IonModal) modal: IonModal;

  constructor(
    private cryptoService: CryptoService,
    private alertCtrl: AlertController,
    private noteService: NotesService,
    private navController: NavController,
    private toastController: ToastController,
    private appProtectorService: AppProtectorService,
    private loadingController: LoadingController,
    private expireService: ExpireService
  ) {
    this.deleteExpiredNotes();
  }

  ionViewWillEnter() {
    if (this.noteService.shouldAskForPassword()) {
      this.should_display = false;
    } else {
      this.setData(this.noteService.getNotesAppPassword()); // will send a password, if the app is encrypted.
    }
  }

  ionViewWillLeave() {
    this.deleteExpireTimer && clearInterval(this.deleteExpireTimer);
  }

  public appHasPasswordChallenge(): boolean {
    return this.noteService.appHasPasswordChallenge();
  }

  private setData(password: string = ''): boolean {
    let decryptedNotes = null;
    if (this.noteService.appHasPasswordChallenge()) {
      let notes = this.noteService.getNotes();
      decryptedNotes = this.cryptoService.decrypt(notes, password);
    } else {
      this.noteService.setDecryptedNotes(this.noteService.getNotes());
      decryptedNotes = this.noteService.getNotes();
    }

    // @ts-ignore
    if (
      decryptedNotes.length == 0 &&
      this.noteService.appHasPasswordChallenge()
    ) {
      return false;
    }

    this.noteService.setDecryptedNotes(decryptedNotes);
    // @ts-ignore
    this.notes = JSON.parse(decryptedNotes);

    return true;
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
    try {
      let shouldUnlock = this.setData(this.input_password_app_unlock);

      this.should_display = true;
      // init protection
      this.appProtectorService.init();
      // store the notes app password in a service.
      this.noteService.setNotesAppPassword(this.input_password_app_unlock);
      // reset failed attempts.
      this.noteService.setFailedPasswordAppAttempts(0);
    } catch (e) {
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
  getNotes() {
    if (this.notes === undefined || this.notes === null) {
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

  getSearchResult() {
    if (this.notes == null) return [];

    this.__notes = this.notes.filter((_note: INote) => {
      return _note.text.includes(this.search);
    });

    return this.__notes;
  }

  public settings(type: string = '') {
    this.navController.navigateForward('app-settings').then((r) => {});
  }

  public handleClickNote(note_id: string) {
    if (!this.checkboxOpened) {
      this.navController.navigateForward('/note/' + note_id).then((r) => {});
    }
  }

  public toggleCheckbox() {
    this.checkboxOpened = !this.checkboxOpened;
    if (!this.checkboxOpened) {
      this.listOfCheckedCheckboxes = new Set<string>();
    }
  }

  /**
   * Being called, when the confirmation has been done.
   * @private
   */
  private async deleteNotes() {
    const loading = await this.loadingController.create();
    await loading.present();

    // delete the selected notes.

    const _notes = this.notes.filter((note: INote) => {
      return !this.listOfCheckedCheckboxes.has(note.id);
    });

    this.saveNotes(_notes);

    this.toggleCheckbox();
    const toast = await this.toastController.create({
      message: 'The selected notes has been deleted.',
      duration: 2500,
      position: 'bottom',
    });

    await toast.present();
    await loading.dismiss();
  }

  private async deleteExpiredNotes() {
    const _delete = () => {
      if (this.notes == undefined) return;
      const _notes = this.notes.filter((note: INote) => {
        return !this.expireService.deletable(
          Number(note.last_modified),
          note.expired_date
        );
      });

      if (this.notes.length > _notes.length) {
        this.saveNotes(_notes);
      }
    };

    while (true) {
      await new Promise((resolve) => {
        _delete();
        resolve(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  private saveNotes(notes: INote[]) {
    this.notes = notes;

    if (this.noteService.appHasPasswordChallenge()) {
      // newly notes to save into storage.
      let encryptedNotesSave = this.cryptoService.encrypt(
        JSON.stringify(this.notes),
        this.noteService.getNotesAppPassword()
      );
      // notes in the app is stored.
      localStorage.setItem('app_password_challenge', '1');
      // update notes, and store.
      this.noteService.setNotes(encryptedNotesSave);
    } else {
      this.noteService.setNotes(JSON.stringify(this.notes));
    }

    this.setData(this.input_password_app_unlock);
  }

  public async resetPassword() {
    const alert = await this.alertCtrl.create({
      header: 'WARNING',
      subHeader:
        'PLEASE CONFIRM THAT YOU WANT TO THE RESET PASSWORD. IF YOU CONFIRM ALL NOTES STORED WILL BE DELETED ON YOUR DEVICE AND CANT BE RECOVERED !',
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
            window.location.href = '/home';
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Will detect if the user presses enter on unlock notes-app.
   * @param ev
   */
  public ionInputAppUnlockInput(ev: any) {
    if (ev.key == 'Enter') {
      this.unlockNotesApp().then((r) => {});
    }
  }

  public handleCheckEvent(checked: Set<string>) {
    this.listOfCheckedCheckboxes = checked;
  }

  public handleInputChange(event: string, type: string) {
    switch (type) {
      case 'password':
        this.input_password_app_unlock = event;
        break;
    }
  }

  public deleteSelectedNotes() {
    this.isDeleteModalOpen = true;
  }

  public onDeleteConfirm(value: boolean) {
    this.isDeleteModalOpen = false;
    if (value) {
    }
    value && setTimeout(() => this.deleteNotes(), 300);
  }

  public onModalDismiss() {
    this.isDeleteModalOpen = false;
  }

  public onSearchChange(event: any) {
    const value = event.target.value;
    this.search = value;

    this.getSearchResult();
  }
}
