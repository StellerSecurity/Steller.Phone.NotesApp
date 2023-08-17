import { Component, OnInit } from '@angular/core';
import {at} from "ionicons/icons";
import {CryptoService} from "../services/crypto.service";
import {ActivatedRoute, ParamMap, Router} from "@angular/router";
import {AlertController, NavController} from "@ionic/angular";
import {NotesService} from "../services/notes.service";
const { v4: uuidv4 } = require('uuid');

declare var require: any;
var CryptoJS = require('crypto-js');

@Component({
  selector: 'app-add-note',
  templateUrl: './add-note.page.html',
  styleUrls: ['./add-note.page.scss'],
})
export class AddNotePage implements OnInit {

  private notesPassword = "lol";

  private notes_id = null;

  private notes = null;

  private currentNote = null;

  private note_locked = false;

  constructor(private cryptoService: CryptoService,
              public activatedRoute: ActivatedRoute,
              private navController: NavController,
              private notesService: NotesService,
              private alertCtrl: AlertController) {

    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {

      // retrieve already encrypted notes in storage (if any)
      const notesStored = this.notesService.getNotes();

      // notes in Storage are encrypted.
      if(notesStored !== null && this.notesService.appHasPasswordChallenge()) {
        this.notes = this.cryptoService.decrypt(notesStored, this.notesService.getNotesAppPassword());
        // @ts-ignore
        this.notes = JSON.parse(this.notes);
      } else if(notesStored !== null) {
        this.notes = JSON.parse(this.notesService.getDecryptedNotes());
      }

      // @ts-ignore
      this.notes_id = params.get('id');
      if(this.notes_id === null) {
        this.notes_id = uuidv4();
      } else {
        // @ts-ignore
        this.currentNote = this.findNote(this.notes_id);
        // @ts-ignore
        if(this.currentNote.protected) {
          this.note_locked = true;
          this.askforNotePassword().then(r => {});
        }
      }
    });

  }

  // should be called on key enter.
  save(ev: any) {

    if(this.notes_id === null) return;

    const value = ev.target!.value;

    let should_encrypt = false;

    let encryptedText = value;

    // encrypt the text.
    if(should_encrypt) {
      encryptedText = btoa(this.cryptoService.encrypt(value, this.notesPassword));
    }

    // newly created note.
    var note = {
      "id": this.notes_id,
      "last_modified": Date.now(),
      "text": encryptedText,
      "protected": false,
      "auto_wipe": false
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
          break;
        }
      }

      // no existing note found, meaning we´re creating a new one.
      if(!found) {
        // @ts-ignore
        this.notes.push(note);
      }

    }

    if(this.notesService.appHasPasswordChallenge()) {
      // newly notes to save into storage.
      let encryptedNotesSave = this.cryptoService.encrypt(JSON.stringify(this.notes), this.notesService.getNotesAppPassword());
      // notes in the app is stored.
      localStorage.setItem("app_password_challenge", "1");
      // update notes, and store.
      this.notesService.setNotes(encryptedNotesSave);
    } else {
      this.notesService.setNotes(JSON.stringify(this.notes));
    }

  }

  public findNote(id: number) {
    let note = null;
    // @ts-ignore
    let notes = this.notes;
    // @ts-ignore
    for(let i = 0; i < notes.length; i++) {
      // @ts-ignore
      if(notes[i].id === id) {
        // @ts-ignore
        note = notes[i];
        break;
      }
    }
    return note;
  }

  public back() {
    this.navController.back();
  }

  ngOnInit() {}

  public async askforNotePassword() {
    // @ts-ignore
    let alert = await this.alertCtrl.create({
      header: 'Protected Note',
      subHeader: 'Enter Password For The Note',
      inputs: [
        {
          name: 'password',
          placeholder: 'Password',
          type: 'password',
        }
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.back();
          },
        },
        {
          text: 'Okay',
          handler: (data: any) => {
            // @ts-ignore
            let decryptedText = CryptoJS.AES.decrypt(atob(this.currentNote.text), data.password);
            decryptedText = decryptedText.toString(CryptoJS.enc.Utf8);

            if(decryptedText == "") {
              return false;
            }

            // @ts-ignore
            this.currentNote.text = decryptedText;
            this.note_locked = false;
            return true;

          },
        },
      ]
    });
    await alert.present();
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
    return this.currentNote.text;
  }

}
