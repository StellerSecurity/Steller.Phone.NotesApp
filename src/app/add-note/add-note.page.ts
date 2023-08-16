import { Component, OnInit } from '@angular/core';
import {at} from "ionicons/icons";
import {CryptoService} from "../services/crypto.service";
import {ActivatedRoute, ParamMap, Router} from "@angular/router";
import {AlertController, NavController} from "@ionic/angular";
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

  private notesAppPassword: string = "DILO1234";

  private notes_id = null;

  private notes = null;

  private currentNote = null;

  private note_locked = false;

  constructor(private cryptoService: CryptoService,
              public activatedRoute: ActivatedRoute,
              private navController: NavController,
              private alertCtrl: AlertController) {

    this.activatedRoute.paramMap.subscribe((params: ParamMap) => {

      // retrieve already encrypted notes in storage (if any)
      const notesStored = localStorage.getItem("notes");

      // notes in DB are stored and encrypted.
      if(notesStored !== null) {
        this.notes = this.cryptoService.decrypt(notesStored, this.notesAppPassword);
        // @ts-ignore
        this.notes = JSON.parse(this.notes);
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

    // encrypt the text.
    let encryptedText = this.cryptoService.encrypt(value, this.notesPassword);

    // newly created note.
    var note = {
      "id": this.notes_id,
      "last_modified": Date.now(),
      "text": btoa(encryptedText),
      "protected": true,
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

    // newly notes to save into storage.
    let encryptedNotesSave = this.cryptoService.encrypt(JSON.stringify(this.notes), this.notesAppPassword);

    // update notes, and store.
    localStorage.setItem("notes", encryptedNotesSave);

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
            } else {
              // @ts-ignore
              this.currentNote.text = decryptedText;
              this.note_locked = false;
              return true;
            }

          },
        },
      ]
    });
    await alert.present();
  }

  public getCurrentNoteText() {

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
