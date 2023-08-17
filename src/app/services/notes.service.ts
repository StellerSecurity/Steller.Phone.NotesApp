import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotesService {

  private decryptedNotes : any = null;

  private notesAppPassword : string = "DILO1234";

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
   * Otherwise, the return, can be null.
   * If there is no notes-password on the app, it should always return a list
   * [if there is any notes.]
   */
  public getDecryptedNotes() {
    return this.decryptedNotes;
  }

  public setNotes(data: any) {
    localStorage.setItem("notes", data);
  }

  /**
   *
   */
  public appHasPasswordChallenge() {
    let has_password_challenge = localStorage.getItem("app_password_challenge");
    return has_password_challenge !== null;
  }

  /**
   * Will reveal the notesAppPassword, if it's in a state that can be revealed,
   * such as if the user just opened the app.
   */
  public getNotesAppPassword() : string {
    return this.notesAppPassword;
  }

  public setNotesAppPassword(password: string) {
    this.notesAppPassword = password;
  }

  public setDecryptedNotes(data: any) {
    this.decryptedNotes = data;
  }

}
