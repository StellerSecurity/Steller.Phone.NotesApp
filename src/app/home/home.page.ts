import { Component, inject } from '@angular/core';
import {AlertController, NavController, RefresherCustomEvent} from '@ionic/angular';

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
              private noteService: NotesService,
              private navController: NavController) {
  }

  ionViewWillEnter() {
    if(this.noteService.getDecryptedNotes() === null && this.noteService.appHasPasswordChallenge()) {
      this.askForNotesAppPassword().then(r => {});
    } else {
      this.setData("");
    }
  }

  private setData(password: string = "") {

    let decryptedNotes = null;
    if(this.noteService.appHasPasswordChallenge()) {
      let notes = this.noteService.getNotes();
      decryptedNotes = this.cryptoService.decrypt(notes, password);
    } else {
      this.noteService.setDecryptedNotes(this.noteService.getNotes());
      console.log(this.noteService.getNotes());
      decryptedNotes = this.noteService.getDecryptedNotes();
    }

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
            this.navController.navigateForward('reset-password');
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

            // store the notes app password in a service.
            this.noteService.setNotesAppPassword(data.password);

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

    if(this.notes === undefined || this.notes === null) {
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
