import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { at } from 'ionicons/icons';
import { CryptoService } from '../services/crypto.service';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import {
  AlertController,
  IonModal,
  LoadingController,
  NavController,
  ToastController,
} from '@ionic/angular';
import { NotesService } from '../services/notes.service';
const { v4: uuidv4 } = require('uuid');
import { INote, IModalInfo, IColor, EExpiredDate } from '../types';

declare var require: any;
var CryptoJS = require('crypto-js');

@Component({
  selector: 'app-add-note',
  templateUrl: './add-note.page.html',
  styleUrls: ['./add-note.page.scss'],
})
export class AddNotePage {
  @ViewChild(IonModal) modal: IonModal;

  public notes_password_input = '';

  private notes_id = null;

  private notes = null;

  private currentNote: INote | null;

  public note_locked = false;

  public notes_password_stored = '';

  public notes_password_confirm = '';

  public passwordStrengthHelperText = '';

  public passwordStrength = 0;

  public note_text = '';

  public isDirty = false;

  public isEditable = true;

  public isConfirmModalOpen: boolean = false;
  public isPasswordModalOpen: boolean = false;
  public isConfirmPasswordOpen: boolean = false;

  public expiredDate: EExpiredDate = EExpiredDate.never;

  public ConfirmModalType = {
    Delete: 'delete',
    Save: 'save',
    Discard: 'discard',
    RemovePassword: 'remove-password'
  };

  public modalInfo: IModalInfo = {
    title: '',
    text: '',
    button1: {
      label: '',
      color: 'note-primary',
    },
    button2: {
      label: '',
      color: 'note-primary',
    },
  };

  public currentModalType = this.ConfirmModalType.Delete;

  constructor(
    private cryptoService: CryptoService,
    public activatedRoute: ActivatedRoute,
    private navController: NavController,
    private notesService: NotesService,
    private toastController: ToastController,
    private alertCtrl: AlertController
  ) {
    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {
      this.notes = JSON.parse(this.notesService.getDecryptedNotes());

      // @ts-ignore
      this.notes_id = params.get('id');
      if (this.notes_id === null) {
        this.isEditable = true;
        this.notes_id = uuidv4();
        this.save();
      }

      // @ts-ignore
      this.currentNote = this.notesService.findNoteById(
        this.notes_id!,
        this.notes
      );

      this.expiredDate = this.currentNote?.expired_date ?? EExpiredDate.never;
      console.log("expiredDate", this.expiredDate);
      // @ts-ignore
      if (this.currentNote.protected) {
        this.note_locked = true;
        this.askforNotePassword().then((r) => {});
      } else {
        // @ts-ignore
        this.note_text = this.currentNote!.text;
      }
    });
  }

  // should be called on key enter.
  save() {
    if (this.notes_id === null) return;

    // @ts-ignore
    let encryptedText = this.note_text;
    let decryptedText = this.note_text;

    // encrypt the text.
    if (this.notes_password_stored.length > 1) {
      encryptedText = this.cryptoService.encrypt(
        this.note_text,
        this.notes_password_stored
      );
    }

    let protectedNote = false;

    if (this.currentNote !== null && this.currentNote !== undefined) {
      // @ts-ignore
      protectedNote = this.currentNote.protected;
    }

    // newly created note.
    var note = {
      id: this.notes_id,
      last_modified: Date.now(),
      text: encryptedText,
      protected: protectedNote,
      auto_wipe: true,
      expired_date: this.expiredDate
    };

    // first time the user creates a note in history.
    if (this.notes === null) {
      // @ts-ignore
      this.notes = [note];
    } else {
      let found = false;

      // @ts-ignore
      for (let i = 0; i < this.notes.length; i++) {
        // @ts-ignore
        if (this.notes[i].id === this.notes_id) {
          found = true;
          // @ts-ignore
          this.notes[i] = note;
          // @ts-ignore
          this.currentNote = note;
          break;
        }
      }

      // no existing note found, meaning we´re creating a new one.
      if (!found) {
        // @ts-ignore
        this.notes.push(note);
        // @ts-ignore
        this.currentNote = note;
      }

      this.note_text = decryptedText;
    }

    this.storeNoteInStorage();
  }

  private storeNoteInStorage() {
    if (this.notesService.appHasPasswordChallenge()) {
      // newly notes to save into storage.
      let encryptedNotesSave = this.cryptoService.encrypt(
        JSON.stringify(this.notes),
        this.notesService.getNotesAppPassword()
      );
      // notes in the app is stored.
      localStorage.setItem('app_password_challenge', '1');
      //update notes, and store.
      this.notesService.setNotes(encryptedNotesSave);
    } else {
      this.notesService.setNotes(JSON.stringify(this.notes));
    }
  }

  public back() {
    this.navController.back();
  }

  public hasPassword() {
    return this.notes_password_stored.length > 0;
  }

  public async askforNotePassword() {
    this.isConfirmPasswordOpen = true;
    return;
  }

  public async unlockNote() {
    // @ts-ignore
    this.notes_password_stored = this.notes_password_input;

    // @ts-ignore
    let decryptedText = this.cryptoService.decrypt(
      this.currentNote!.text,
      this.notes_password_input
    );

    // @ts-ignore

    if (decryptedText.length == 0) {
      const toast = await this.toastController.create({
        message: 'The password is not correct. Try again.',
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();
      return false;
    }

    // @ts-ignore
    this.currentNote.text = decryptedText;

    this.note_text = decryptedText;

    this.note_locked = false;

    this.isConfirmPasswordOpen = false;
    return true;
  }

  public getCurrentNoteText() {
    // the note is locked, meaning it's protected with password,
    // do not reveal until the PW has been written.
    if (this.note_locked) {
      return '';
    }
    if (this.currentNote === null) {
      return '';
    }

    // @ts-ignore
    return this.note_text;
  }

  public async dismissModal() {
    await this.modal.dismiss();
  }

  public notesPasswordChange() {
    // Initialize variables
    var tips = '';

    this.passwordStrength = 0;

    if (this.notes_password_input.length == 0) {
      this.passwordStrengthHelperText = '';
      return;
    }

    // Check password length
    if (this.notes_password_input.length <= 4) {
      tips += 'Make the password longer. ';
    } else {
      this.passwordStrength += 1;
    }

    // Check for mixed case
    if (
      this.notes_password_input.match(/[a-z]/) &&
      this.notes_password_input.match(/[A-Z]/)
    ) {
      this.passwordStrength += 1;
    } else {
      tips += 'Use both lowercase and uppercase letters. ';
    }

    // Check for numbers
    if (this.notes_password_input.match(/\d/)) {
      this.passwordStrength += 1;
    } else {
      tips += 'Include at least one number. ';
    }

    // Check for special characters
    if (this.notes_password_input.match(/[^a-zA-Z\d]/)) {
      this.passwordStrength += 1;
    } else {
      tips += 'Include at least one special character. ';
    }

    // Return results
    if (this.passwordStrength < 2) {
      this.passwordStrengthHelperText = 'Easy to guess. ' + tips;
    } else if (this.passwordStrength === 2) {
      this.passwordStrengthHelperText = 'Medium difficulty. ' + tips;
    } else if (this.passwordStrength === 3) {
      this.passwordStrengthHelperText = 'Difficult. ' + tips;
    } else {
      this.passwordStrengthHelperText = 'Extremely difficult. ' + tips;
    }
  }

  public async lockNote() {
    if (this.notes_password_input !== this.notes_password_confirm) {
      const toast = await this.toastController.create({
        message: 'The two passwords does not match.',
        duration: 2500,
        position: 'bottom',
      });

      await toast.present();
      return;
    }

    if (this.notes_password_input.length < 2) {
      const toast = await this.toastController.create({
        message: 'The password is too weak. Please make it stronger.',
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();
      return;
    }

    // @ts-ignore
    this.notes_password_stored = this.notes_password_input;

    // @ts-ignore
    let decryptedText = this.note_text;

    // @ts-ignore
    let encryptedText = this.cryptoService.encrypt(
      this.note_text,
      this.notes_password_stored
    );

    // @ts-ignore
    this.currentNote.protected = true;
    // @ts-ignore
    this.currentNote.text = encryptedText;

    // find the current note.
    // @ts-ignore
    for (let i = 0; i < this.notes.length; i++) {
      // @ts-ignore
      if (this.notes[i].id === this.notes_id) {
        // @ts-ignore
        this.notes[i] = this.currentNote;
        // @ts-ignore;
        break;
      }
    }

    this.storeNoteInStorage();

    // @ts-ignore
    this.currentNote.text = decryptedText;

    this.notes_password_confirm = '';
    this.notes_password_input = '';

    await this.dismissModal();
  }

  public async removeLock() {
    const alert = await this.alertCtrl.create({
      header: 'WARNING',
      subHeader:
        'Are you sure, you want to remove the password for the note? It will be stored in a decrypted-state on your device, if the lock is removed.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // this.handlerMessage = 'Alert canceled';
          },
        },
        {
          text: 'Remove lock',
          role: 'confirm',
          handler: () => {
            // @ts-ignore
            for (let i = 0; this.notes.length > i; i++) {
              // @ts-ignore
              if (this.notes[i].id === this.notes_id) {
                // @ts-ignore
                this.notes[i].text = this.note_text; // ensure it is not encrypted text.
                // @ts-ignore
                this.notes[i].protected = false;
                // @ts-ignore
                this.currentNote = this.notes[i];
                this.notes_password_stored = '';
                break;
              }
            }

            // update.
            this.storeNoteInStorage();
            this.modal.dismiss();
          },
        },
      ],
    });

    await alert.present();
  }
  public async openLockModal() {
    await this.modal.present();
  }

  public getProtected() {
    // @ts-ignore
    return this.currentNote.protected;
  }
  public async deleteNote() {
    // @ts-ignore
    for (let i = 0; this.notes.length > i; i++) {
      // @ts-ignore
      if (this.notes[i].id === this.notes_id) {
        // @ts-ignore
        this.notes.splice(i, 1);
        break;
      }
    }

    // updated list will not have the current note.
    this.storeNoteInStorage();
    this.currentNote = null;

    this.isConfirmModalOpen = false;

    setTimeout(() => {
      this.navController.navigateForward('/home');
    }, 300);
  }

  openModal(type: string) {
    switch (type) {
      case this.ConfirmModalType.Delete:
        this.setConfirmModal(
          this.ConfirmModalType.Delete,
          'Are you sure?',
          'You want to delete this note? This action cannot be undone.',
          'CANCEL',
          'DELETE',
          'note-danger'
        );

        this.isConfirmModalOpen = true;
        break;
      case this.ConfirmModalType.Discard:
        break;
      case this.ConfirmModalType.Save:
        break;
      case 'set-password':
        if (this.notes_password_stored.length > 0) {
          this.currentModalType = this.ConfirmModalType.RemovePassword;
          this.setConfirmModal(
            this.ConfirmModalType.RemovePassword,
            'Are you sure?',
            'You want to remove password for this note?',
            'CANCEL',
            'REMOVE',
            'note-warning'
          );
          this.isConfirmModalOpen = true;
        } else {
          this.isPasswordModalOpen = true;
        }
        break;
      case 'confirm-password':
    }
  }

  onConfirm(actionType: boolean) {
    if (actionType) {
      switch (this.currentModalType) {
        case this.ConfirmModalType.Delete:
          this.isConfirmModalOpen = false;
          this.deleteNote();

          break;
        case this.ConfirmModalType.Discard:
          this.isConfirmModalOpen = false;
          this.deleteNote();

          break;
        case this.ConfirmModalType.Save:
          this.isConfirmModalOpen = false;
          this.save();

          this.back();
          break;
        case this.ConfirmModalType.RemovePassword:
          this.notes_password_stored = '';
          this.notes_password_input = '';
          this.currentNote && (this.currentNote.protected = false);

          this.save();

          setTimeout(() => {
            this.isConfirmModalOpen = false;
          }, 300)
      }
    } else {
      this.isConfirmModalOpen = false;
    }
  }

  handleOnBack() {
    if (this.note_text.length == 0) {
      this.deleteNote();
      return;
    }

    this.save();

    setTimeout(() => {
      this.back();
    }, 300);
  }

  handleExpireChange = (e: any) => {
    this.expiredDate = e.target.value;
    this.currentNote!.expired_date = e.target.value;
    this.save();
  }

  setConfirmModal(
    modalType: string,
    title: string,
    text: string,
    label1: string,
    label2: string,
    color2: IColor
  ) {
    this.currentModalType = modalType;

    this.modalInfo.title = title;
    this.modalInfo.text = text;
    this.modalInfo.button1.label = label1;
    this.modalInfo.button2.label = label2;
    this.modalInfo.button2.color = color2;
  }

  handleInputChange(event: any, type: string) {
    const value = event.target.value;

    switch (type) {
      case 'text':
        this.note_text = value;
        this.save();
        break;
      case 'password':
        this.notes_password_input = value;
        break;
      case 'confirm-password':
        this.notes_password_confirm = value;
        break;
    }
  }

  onModalDismiss() {
    this.isConfirmModalOpen = false;
    this.isPasswordModalOpen = false;
    this.isConfirmPasswordOpen = false;

    this.notes_password_confirm = '';
    this.notes_password_input = '';
  }

  enableToEdit() {
    this.isEditable = true;
  }

  cancel() {
    this.isConfirmModalOpen = false;
    this.isPasswordModalOpen = false;
    this.isConfirmPasswordOpen = false;
    this.back();
  }
}
