import {Injectable} from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotesService {

  private decryptedNotes : any = null;

  /**
   * Holds the app password if there is any.
   * @private
   */
  private notesAppPassword : string = "";

  /**
   * Controls, when the active time was for the notesApp, when it was active && unlocked.
   * @private
   */
  private LAST_ACTIVITY_TIMESTAMP = 0;
  private readonly APP_LOCK_TIMEOUT_MINUTES_KEY = 'app_lock_timeout_minutes';
  private readonly APP_FAILED_ATTEMPTS_KEY = 'failedAttemptsApp';
  private readonly APP_LOCKOUT_UNTIL_KEY = 'app_lockout_until';
  private readonly NOTE_FAILED_ATTEMPTS_PREFIX = 'note_failed_attempts_';
  private readonly NOTE_LOCKOUT_UNTIL_PREFIX = 'note_lockout_until_';

  /**
   * If the user has chosen to add a password to the notes-app,
   * the methods returns an encrypted AES string.
   */
  public getNotes() {
    let notes = localStorage.getItem("notes");

    if(notes == null) {
      return "[]";
    }

    return notes;
  }

  public setFailedPasswordAppAttempts(attempts: number) {
    localStorage.setItem(this.APP_FAILED_ATTEMPTS_KEY, String(Math.max(0, attempts)));
  }

  public getFailedPasswordAppAttempts(): number {
    const raw = localStorage.getItem(this.APP_FAILED_ATTEMPTS_KEY);
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  public clearAppUnlockFailures() {
    localStorage.removeItem(this.APP_FAILED_ATTEMPTS_KEY);
    localStorage.removeItem(this.APP_LOCKOUT_UNTIL_KEY);
  }

  private getNoteFailedAttemptsKey(noteId: string): string {
    return `${this.NOTE_FAILED_ATTEMPTS_PREFIX}${noteId}`;
  }

  private getNoteLockoutUntilKey(noteId: string): string {
    return `${this.NOTE_LOCKOUT_UNTIL_PREFIX}${noteId}`;
  }

  public getFailedPasswordNoteAttempts(noteId: string): number {
    const raw = localStorage.getItem(this.getNoteFailedAttemptsKey(noteId));
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return Math.floor(parsed);
  }

  public setFailedPasswordNoteAttempts(noteId: string, attempts: number) {
    localStorage.setItem(this.getNoteFailedAttemptsKey(noteId), String(Math.max(0, attempts)));
  }

  public clearNoteUnlockFailures(noteId: string) {
    localStorage.removeItem(this.getNoteFailedAttemptsKey(noteId));
    localStorage.removeItem(this.getNoteLockoutUntilKey(noteId));
  }

  public getNoteUnlockLockoutRemainingMs(noteId: string, now = Date.now()): number {
    const raw = localStorage.getItem(this.getNoteLockoutUntilKey(noteId));
    const until = Number(raw);

    if (!Number.isFinite(until) || until <= 0) {
      return 0;
    }

    if (until <= now) {
      localStorage.removeItem(this.getNoteLockoutUntilKey(noteId));
      return 0;
    }

    return until - now;
  }

  public registerFailedNoteUnlockAttempt(noteId: string, now = Date.now()): number {
    const attempts = this.getFailedPasswordNoteAttempts(noteId) + 1;
    this.setFailedPasswordNoteAttempts(noteId, attempts);

    if (attempts < 5) {
      return 0;
    }

    const lockoutMs = Math.min(15 * 60_000, 30_000 * Math.pow(2, attempts - 5));
    localStorage.setItem(this.getNoteLockoutUntilKey(noteId), String(now + lockoutMs));

    return lockoutMs;
  }

  public getAppUnlockLockoutRemainingMs(now = Date.now()): number {
    const raw = localStorage.getItem(this.APP_LOCKOUT_UNTIL_KEY);
    const until = Number(raw);

    if (!Number.isFinite(until) || until <= 0) {
      return 0;
    }

    if (until <= now) {
      localStorage.removeItem(this.APP_LOCKOUT_UNTIL_KEY);
      return 0;
    }

    return until - now;
  }

  public registerFailedAppUnlockAttempt(now = Date.now()): number {
    const attempts = this.getFailedPasswordAppAttempts() + 1;
    this.setFailedPasswordAppAttempts(attempts);

    if (attempts < 5) {
      return 0;
    }

    const lockoutMs = Math.min(15 * 60_000, 30_000 * Math.pow(2, attempts - 5));
    localStorage.setItem(this.APP_LOCKOUT_UNTIL_KEY, String(now + lockoutMs));

    return lockoutMs;
  }

  /**
   * Will find a note by its ID.
   * @param id
   * @param notes
   */
  public findNoteById(id: string, notes: any) {

    if(notes === null) return;

    let note = null;

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

  /**
   * Determines if we should ask the user about the password for app-access.
   */
  public shouldAskForPassword() : boolean {
    return this.appHasPasswordChallenge() && this.notesAppPassword == "";
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

  public clearSensitiveRuntimeState() {
    this.notesAppPassword = '';
    this.decryptedNotes = null;
    this.LAST_ACTIVITY_TIMESTAMP = 0;
  }

  public setAppLockTimeoutMinutes(minutes: number) {
    localStorage.setItem(this.APP_LOCK_TIMEOUT_MINUTES_KEY, String(minutes));
  }

  public getAppLockTimeoutMinutes(): number {
    const raw = localStorage.getItem(this.APP_LOCK_TIMEOUT_MINUTES_KEY);
    const parsed = Number(raw);
    const allowed = [1, 5, 15, 30, 60];

    if (!Number.isFinite(parsed) || !allowed.includes(parsed)) {
      return 60;
    }

    return parsed;
  }

  public setLastActivityTimestamp(timestamp: number) {
    this.LAST_ACTIVITY_TIMESTAMP = timestamp;
  }

  /**
   * Returns timestamp of when the user last was active on the app (foreground).
   * @return number
   */
  public getLastActivityTimestamp() {
    return this.LAST_ACTIVITY_TIMESTAMP;
  }

}
