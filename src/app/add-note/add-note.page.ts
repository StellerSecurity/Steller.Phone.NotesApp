import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {at} from "ionicons/icons";
import {CryptoService} from "../services/crypto.service";
import {ActivatedRoute, ParamMap, Router} from "@angular/router";
import {AlertController, IonModal, LoadingController, NavController, ToastController, ModalController} from "@ionic/angular";
import {NotesService} from "../services/notes.service";
import { NoteLockedModalComponent } from '../note-locked-modal/note-locked-modal.component';
import { DeleteNoteModalComponent } from '../delete-note-modal/delete-note-modal.component';
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

  constructor(private cryptoService: CryptoService,
              public activatedRoute: ActivatedRoute,
              private navController: NavController,
              private notesService: NotesService,
              private toastController: ToastController,
              private modalCtrl: ModalController,
              private alertCtrl: AlertController) {

    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {

      this.notes = JSON.parse(this.notesService.getDecryptedNotes());
      console.log(this.notesService.getDecryptedNotes());

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

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
  toggleConfirmPasswordVisibility() {
    this.confirmShowPassword = !this.confirmShowPassword;
  }
  // should be called on key enter.
  save(ev: any) {

    console.log("Save, method");
    if(this.notes_id === null) return;

    let value = " ";
    if(ev !== null) {
      value = ev.target!.value;
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

            // @ts-ignore
            let decryptedText = this.cryptoService.decrypt(this.currentNote.text, inputValue);

            if (decryptedText.length == 0) {
              const toast = await this.toastController.create({
                message: 'The password is not correct. Try again.',
                duration: 3000,
                position: 'bottom',
              });

              await toast.present();
              await this.askforNotePassword();
              // Don't close the modal if the password is incorrect
            } else {
              // @ts-ignore
              this.currentNote.text = decryptedText;
              this.note_text = decryptedText;

              this.note_locked = false;
              // Close the modal since the password is correct
              await modal.dismiss();
            }
        } else {
          // Handle case when user cancels password input
        }
      }
    });

    return await modal.present();

  }

  public getCurrentNoteText() {
    // the note is locked, meaning it's protected with password,
    // do not reveal until the PW has been written.
    if(this.note_locked) {
      return "";
    }
    if(this.currentNote === null) {
      return "";
    }

    // @ts-ignore
    return this.note_text;
  }


  public async dismissModal() {
    await this.modal.dismiss();
  }

  public notesPasswordChange() {

    // Initialize variables
    var tips = "";

    this.passwordStrength = 0;

    if(this.notes_password_input.length == 0) {
      this.passwordStrengthHelperText = "";
      return;
    }

    // Check password length
    if (this.notes_password_input.length <= 4) {
      tips += "Make the password longer. ";
    } else {
      this.passwordStrength += 1;
    }

    // Check for mixed case
    if (this.notes_password_input.match(/[a-z]/) && this.notes_password_input.match(/[A-Z]/)) {
      this.passwordStrength += 1;
      this.upperLower = true;
    } else {
      tips += "Use both lowercase and uppercase letters. ";
      this.upperLower = false;
    }

    // Check for numbers
    if (this.notes_password_input.match(/\d/)) {
      this.passwordStrength += 1;
    } else {
      tips += "Include at least one number. ";
    }

    // Check for special characters
    if (this.notes_password_input.match(/[^a-zA-Z\d]/)) {
      this.passwordStrength += 1;
      this.specialChar = true;
    } else {
      tips += "Include at least one special character. ";
      this.specialChar = false;
    }


    // Check password length
    if (this.notes_password_input.length >= 6) {
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
    } /*
    if (this.passwordStrength < 2) {
      this.passwordStrengthHelperText = "Easy to guess. " + tips;
    } else if (this.passwordStrength === 2) {
      this.passwordStrengthHelperText = "Medium difficulty. " + tips;
    } else if (this.passwordStrength === 3) {
      this.passwordStrengthHelperText = "Difficult. " + tips;
    } else {
      this.passwordStrengthHelperText = "Extremely difficult. " + tips;
    }*/
  }

  public async lockNote() {

    console.log("end of locking note");
    if (this.notes_password_input !== this.notes_password_confirm) {
      const toast = await this.toastController.create({
        message: 'The two passwords does not match.',
        duration: 2500,
        position: 'bottom',
      });

      await toast.present();
      return;
    }

    if(this.notes_password_input.length < 2) {
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
    let decryptedText = this.currentNote.text;

    // @ts-ignore
    console.log(this.currentNote.text);

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
        console.log(10);
        // @ts-ignore
        console.log(this.notes[i]);
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
      header: 'WARNING',
      subHeader: 'Are you sure, you want to remove the password for the note? It will be stored in a decrypted-state on your device, if the lock is removed.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // this.handlerMessage = 'Alert canceled';
          },
        },         {
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
          this.navController.navigateForward('/home');
        } else {
          // Handle case when user cancels password input
        }
      }
    });

    return await modal.present();

    
    /*const alert = await this.alertCtrl.create({
      header: 'Confirm',
      subHeader: 'Please confirm that you want to delete this note. It cannot be recovered!',
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
          handler: () => {

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
            this.navController.navigateForward('/home');
          },
        },
      ],
    });

    await alert.present();*/
  }

}
