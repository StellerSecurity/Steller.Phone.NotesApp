import { Component, inject } from '@angular/core';
import {AlertController, RefresherCustomEvent} from '@ionic/angular';

import {Router} from "@angular/router";
import {CryptoService} from "../services/crypto.service";
import {NotesService} from "../services/notes.service";
declare var require: any;
var CryptoJS = require('crypto-js');


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  private notes: any;


  constructor(private cryptoService: CryptoService,
              private alertCtrl: AlertController,
              private noteService: NotesService) {

    if(this.noteService.getDecryptedNotes() === null) {
      this.askForNotesAppPassword();
    }
  }

  ionViewWillEnter() {

  }

  private setData(password: string) {
    let notes = this.noteService.getNotes();
    let decryptedNotes = this.cryptoService.decrypt(notes, password);
    this.noteService.setDecryptedNotes(decryptedNotes);
    this.notes = JSON.parse(decryptedNotes);
  }

  /**
   * The method will ask the password for the notes-app (if set),
   * when the state of notes-app is either first-time opened
   * or if have been idle for x minutes.
   */
  public async askForNotesAppPassword() {

    // @ts-ignore
    let alert = await this.alertCtrl.create({
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
            //this.back();
          },
        },
        {
          text: 'Okay',
          handler: (data: any) => {
            // @ts-ignore

            this.setData(data.password);

            if(this.notes === null) {
              // wrong password, call a counter, [where should be stored?]
              return false;
            }

            // set counter to, 0.
            return true;

          },
        },
      ]
    });
    await alert.present();

  }

  /**
   * Will get the decrypted notes (if there is any),
   * and sort them by last modified.
   */
  getNotes()  {

    if(this.notes === undefined) {
      return [];
    }

    // sort notes by last modified date
    // @ts-ignore
    this.notes = this.notes.sort((a, b) => {
      if (a.last_modified > b.last_modified) {
        return -1;
      }
    });

    return this.notes;
  }

}
