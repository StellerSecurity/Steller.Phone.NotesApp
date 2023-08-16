import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotesService {

  private decryptedNotes : any = null;

  constructor() { }

  /**
   * If the user has chosen to add a password to the notes-app,
   * the methods returns an encrypted AES string.
   */
  public getNotes() {
    return localStorage.getItem("notes");
  }

  /**
   * Will return the notes in a decrypted state.
   * Only if the user has unlocked the app and any other states has been meet.
   * Otherwise the return, can be null.
   */
  public getDecryptedNotes() {
    return this.decryptedNotes;
  }

  public setDecryptedNotes(data: any) {
    this.decryptedNotes = data;
  }

}
