import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {at} from "ionicons/icons";
import {CryptoService} from "../services/crypto.service";
import {ActivatedRoute, ParamMap, Router} from "@angular/router";
import {AlertController, IonModal, LoadingController, NavController, ToastController, ModalController} from "@ionic/angular";
import {NotesService} from "../services/notes.service";
import { NoteLockedModalComponent } from '../note-locked-modal/note-locked-modal.component';
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
import {AngularEditorConfig} from "@wfpena/angular-wysiwyg";
import { TranslatorService } from '../services/translator.service';
const { v4: uuidv4 } = require('uuid');

declare var require: any;
var CryptoJS = require('crypto-js');

@Component({
  selector: 'app-add-note',
  templateUrl: './add-note.page.html',
  styleUrls: ['./add-note.page.scss'],
})
export class AddNotePage {

  @ViewChild(IonModal) modal: IonModal;

  public notes_password_input = "";

  private notes_id = null;

  private notes = null;

  private currentNote = null;

  public note_locked = false;

  public notes_password_stored = "";

  public notes_password_confirm = "";

  public passwordStrengthHelperText = "";
  
  public showPassword = false;
  public confirmShowPassword = false;
  public strongPass = false;
  public upperLower = false;
  public specialChar = false;

  public passwordStrength = 0;

  public note_text = "";

  public editorConfig: AngularEditorConfig = {
    editable: true,
    spellcheck: false,
    height: '100vh',
    minHeight: '0',
    maxHeight: 'auto',
    textAreaBackgroundColor: 'white',
    width: 'auto',
    minWidth: '0',
    translate: 'no',
    enableToolbar: true,
    showToolbar: true,
    placeholder: 'Enter your note here..',
    defaultParagraphSeparator: '',
    defaultFontName: '',
    defaultFontSize: '',
    imageResizeSensitivity: 3,
    uploadWithCredentials: false,
    sanitize: true,
    toolbarPosition: 'top',
    outline: false,
    toolbarHiddenButtons: [
      ['italic', 'underline', 'superscript', 'subscript'],
      ['fontName', 'fontSize', 'color'],
      ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull', 'indent', 'outdent'],
      ['cut', 'copy', 'delete', 'removeFormat'],
      ['paragraph', 'blockquote', 'removeBlockquote', 'horizontalLine',  'unorderedList'],
      ['video', 'insertVideo', 'horizontalline', 'insertHorizontalRule', 'toggleEditorMode'],
      ['backgroundColor', 'foregroundColor', 'textColor']
    ],
  };
  allTranslations:any;

  constructor(private cryptoService: CryptoService,
              public activatedRoute: ActivatedRoute,
              private navController: NavController,
              private notesService: NotesService,
              private toastController: ToastController,
              private modalCtrl: ModalController,
              private alertCtrl: AlertController,
              private translatorService: TranslatorService) {

    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {

      this.notes = JSON.parse(this.notesService.getDecryptedNotes());

      // @ts-ignore
      this.notes_id = params.get('id');
      if(this.notes_id === null) {
        this.notes_id = uuidv4();
        this.save(null);
      }

      // @ts-ignore
      this.currentNote = this.notesService.findNoteById(this.notes_id, this.notes);

      // @ts-ignore
      if(this.currentNote.protected) {
        this.note_locked = true;
        this.askforNotePassword().then(r => {});
      }

      // @ts-ignore
      this.note_text = this.currentNote.text;
    });

  }

  ionViewWillEnter(): void {
    this.allTranslations = this.translatorService.allTranslations; 
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
  toggleConfirmPasswordVisibility() {
    this.confirmShowPassword = !this.confirmShowPassword;
  }
  // should be called on key enter.
  save(ev: any) {

    if(this.notes_id === null) return;
    if(this.note_locked) return;

    let value = " ";
    if(this.note_text.length > 0) {
      value = this.note_text;
    }

    // @ts-ignore
    let encryptedText = value;
    let decryptedText = value;

    // encrypt the text.
    if(this.notes_password_stored.length > 1) {
      encryptedText = this.cryptoService.encrypt(value, this.notes_password_stored);
    }

    let protectedNote = false;

    if(this.currentNote !== null) {
      // @ts-ignore
      protectedNote = this.currentNote.protected;
    }

    // newly created note.
    var note = {
      "id": this.notes_id,
      "last_modified": Date.now(),
      "text": encryptedText,
      "protected": protectedNote,
      "auto_wipe": true,
    };

    // first time the user creates a note in history.
    if(this.notes === null) {
      // @ts-ignore
      this.notes = [note];
    } else {
      let found = false;

      // @ts-ignore
      for(let i = 0; i < this.notes.length; i++) {
        // @ts-ignore
        if(this.notes[i].id === this.notes_id) {
          found = true;
          // @ts-ignore
          this.notes[i] = note;
          // @ts-ignore
          this.currentNote = note;
          break;
        }
      }

      // no existing note found, meaning we´re creating a new one.
      if(!found) {
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
    if(this.notesService.appHasPasswordChallenge()) {
      // newly notes to save into storage.
      let encryptedNotesSave = this.cryptoService.encrypt(JSON.stringify(this.notes), this.notesService.getNotesAppPassword());
      // notes in the app is stored.
      localStorage.setItem("app_password_challenge", "1");
      //update notes, and store.
      this.notesService.setNotes(encryptedNotesSave);
    } else {
      this.notesService.setNotes(JSON.stringify(this.notes));
    }

  }

  public back() {
    this.navController.back();
  }


  private async wrongPasswordEntered() {
    const toast = await this.toastController.create({
      message: this.allTranslations.passwordIsNotCorrectTryAgain,
      duration: 3000,
      position: 'bottom',
    });

    await toast.present();
    await this.askforNotePassword();
  }

  public async askforNotePassword() {
    // @ts-ignore
    const modal = await this.modalCtrl.create({
      component: NoteLockedModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm, inputValue } = data.data;
        if (confirm) {
          this.notes_password_stored = inputValue;

            try {
              // @ts-ignore
              let decryptedText = this.cryptoService.decrypt(this.currentNote.text, inputValue);

              if(decryptedText.length == 0) {
                await this.wrongPasswordEntered();
                return;
              }

              // @ts-ignore
              this.currentNote.text = decryptedText;
              this.note_text = decryptedText;

              this.note_locked = false;
              // Close the modal since the password is correct
              await modal.dismiss();

            } catch (e) {
              await this.wrongPasswordEntered();
            }


        } else {
          // Handle case when user cancels password input
          this.back();
        }
      }
    });

    return await modal.present();

  }

  public async dismissModal() {
    await this.modal.dismiss();
  }

  public notesPasswordChange() {

    this.passwordStrength = 0;

    if(this.notes_password_input.length == 0) {
      this.passwordStrengthHelperText = "";
      return;
    }

    // Check password length
    if (this.notes_password_input.length <= 4) {
    } else {
      this.passwordStrength += 1;
    }

    // Check for mixed case
    if (this.notes_password_input.match(/[a-z]/) && this.notes_password_input.match(/[A-Z]/)) {
      this.passwordStrength += 1;
      this.upperLower = true;
    } else {
      this.upperLower = false;
    }

    // Check for numbers
    if (this.notes_password_input.match(/\d/)) {
      this.passwordStrength += 1;
    }

    // Check for special characters
    if (this.notes_password_input.match(/[^a-zA-Z\d]/)) {
      this.passwordStrength += 1;
      this.specialChar = true;
    } else {
      this.specialChar = false;
    }


    // Check password length
    if (this.notes_password_input.length >= 6) {
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


  public async lockNote() {

    if (this.notes_password_input !== this.notes_password_confirm) {
      const toast = await this.toastController.create({
        message: this.allTranslations.theTwoPasswordsDoesNotMatch,
        duration: 2500,
        position: 'bottom',
      });

      await toast.present();
      return;
    }

    if(this.notes_password_input.length < 2) {
      const toast = await this.toastController.create({
        message: this.allTranslations.thePasswordIsTooWeakPleaseMakeItStronger,
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();
      return;
    }

    // @ts-ignore
    this.notes_password_stored = this.notes_password_input;

    // @ts-ignore
    let decryptedText = this.currentNote.text;

    // @ts-ignore
    let encryptedText = this.cryptoService.encrypt(this.currentNote.text, this.notes_password_stored);

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
        break;
      }
    }

    this.storeNoteInStorage();

    // @ts-ignore
    this.currentNote.text = decryptedText;

    this.notes_password_confirm = "";
    this.notes_password_input = "";

    await this.dismissModal();
  }

  public async removeLock() {
    const alert = await this.alertCtrl.create({
      header: this.allTranslations.warningCap,
      subHeader: this.allTranslations.areYouSureYouWantToRemoveThePasswordForTheNote,
      buttons: [
        {
          text: this.allTranslations.cancel,
          role: 'cancel',
          handler: () => {
            // this.handlerMessage = 'Alert canceled';
          },
        },         {
          text: this.allTranslations.removeLock,
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
                this.notes_password_stored = "";
                break;
              }
            }

            // update.
            this.storeNoteInStorage();
            this.modal.dismiss();

          },
        }],
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
    const modal = await this.modalCtrl.create({
      component: DeleteNoteModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm } = data.data;
        if (confirm) {
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
          await this.navController.navigateForward('/home');
        } else {
          // Handle case when user cancels password input
        }
      }
    });

    return await modal.present();
  }

}
