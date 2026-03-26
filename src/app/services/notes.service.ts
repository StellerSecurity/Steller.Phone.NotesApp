import { Injectable } from '@angular/core';
import { NotesStorageService } from './notes-storage.service';
@Injectable({
  providedIn: 'root'
})
export class NotesService {
  constructor(private notesStorageService: NotesStorageService) {}
  private decryptedNotes: any = null;
  private notesAppPassword: string = "";
  private LAST_ACTIVITY_TIMESTAMP = 0;
  private readonly NOTE_FAILED_ATTEMPTS_PREFIX = 'note_failed_attempts_';
  private readonly NOTE_LOCKOUT_UNTIL_PREFIX = 'note_lockout_until_';
  public getNotes() {
    return this.notesStorageService.getNotesRaw();
  }
  public async flushPersistence(): Promise<void> {
    await this.notesStorageService.flush();
  }
  public setFailedPasswordAppAttempts(attempts: number) {
    this.notesStorageService.setFailedAttempts(String(Math.max(0, attempts)));
  }
  public getFailedPasswordAppAttempts(): number {
    const raw = this.notesStorageService.getFailedAttempts();
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }
  public clearAppUnlockFailures() {
    this.notesStorageService.removeFailedAttempts();
    this.notesStorageService.removeAppLockoutUntil();
  }
  private getNoteFailedAttemptsKey(noteId: string): string {
    return `${this.NOTE_FAILED_ATTEMPTS_PREFIX}${noteId}`;
  }
  private getNoteLockoutUntilKey(noteId: string): string {
    return `${this.NOTE_LOCKOUT_UNTIL_PREFIX}${noteId}`;
  }
  public getFailedPasswordNoteAttempts(noteId: string): number {
    const raw = this.notesStorageService.getValue(this.getNoteFailedAttemptsKey(noteId));
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.floor(parsed);
  }
  public setFailedPasswordNoteAttempts(noteId: string, attempts: number) {
    this.notesStorageService.setValue(this.getNoteFailedAttemptsKey(noteId), String(Math.max(0, attempts)));
  }
  public clearNoteUnlockFailures(noteId: string) {
    this.notesStorageService.removeValue(this.getNoteFailedAttemptsKey(noteId));
    this.notesStorageService.removeValue(this.getNoteLockoutUntilKey(noteId));
  }
  public getNoteUnlockLockoutRemainingMs(noteId: string, now = Date.now()): number {
    const raw = this.notesStorageService.getValue(this.getNoteLockoutUntilKey(noteId));
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= 0) {
      return 0;
    }
    if (until <= now) {
      this.notesStorageService.removeValue(this.getNoteLockoutUntilKey(noteId));
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
    this.notesStorageService.setValue(this.getNoteLockoutUntilKey(noteId), String(now + lockoutMs));
    return lockoutMs;
  }
  public getAppUnlockLockoutRemainingMs(now = Date.now()): number {
    const raw = this.notesStorageService.getAppLockoutUntil();
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= 0) {
      return 0;
    }
    if (until <= now) {
      this.notesStorageService.removeAppLockoutUntil();
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
    this.notesStorageService.setAppLockoutUntil(String(now + lockoutMs));
    return lockoutMs;
  }
  public findNoteById(id: string, notes: any) {
    if (notes === null) return;
    let note = null;
    // @ts-ignore
    for (let i = 0; i < notes.length; i++) {
      // @ts-ignore
      if (notes[i].id === id) {
        // @ts-ignore
        note = notes[i];
        break;
      }
    }
    return note;
  }
  public shouldAskForPassword(): boolean {
    return this.appHasPasswordChallenge() && this.notesAppPassword == "";
  }
  public getDecryptedNotes() {
    return this.decryptedNotes;
  }
  public setNotes(data: any) {
    this.notesStorageService.setNotesRaw(data);
  }
  public appHasPasswordChallenge() {
    return this.notesStorageService.getAppPasswordChallengeFlag() !== null;
  }
  public getNotesAppPassword(): string {
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
    this.notesStorageService.setAppLockTimeoutMinutes(String(minutes));
  }
  public getAppLockTimeoutMinutes(): number {
    const raw = this.notesStorageService.getAppLockTimeoutMinutes();
    const parsed = Number(raw);
    const allowed = [1, 5, 15, 30, 60];
    if (!Number.isFinite(parsed) || !allowed.includes(parsed)) {
      return 60;
    }
    return parsed;
  }
  public clearInactiveWipeSettings() {
    this.notesStorageService.removeAppWipeAfterDays();
    this.notesStorageService.removeAppLastUnlockAt();
  }
  public setAppPasswordChallengeEnabled(enabled: boolean) {
    if (enabled) {
      this.notesStorageService.setAppPasswordChallengeFlag('1');
      return;
    }
    this.notesStorageService.removeAppPasswordChallengeFlag();
    this.clearInactiveWipeSettings();
  }
  public setLastActivityTimestamp(timestamp: number) {
    this.LAST_ACTIVITY_TIMESTAMP = timestamp;
  }
  public setAppWipeAfterDays(days: number) {
    const allowed = [0, 7, 14, 30, 60, 90];
    const normalized = allowed.includes(days) ? days : 0;
    this.notesStorageService.setAppWipeAfterDays(String(normalized));
  }
  public getAppWipeAfterDays(): number {
    const raw = this.notesStorageService.getAppWipeAfterDays();
    const parsed = Number(raw);
    const allowed = [0, 7, 14, 30, 60, 90];
    if (!Number.isFinite(parsed) || !allowed.includes(parsed)) {
      return 0;
    }
    return parsed;
  }
  public recordSuccessfulAppUnlock(now = Date.now()) {
    this.notesStorageService.setAppLastUnlockAt(String(now));
  }
  public getLastSuccessfulAppUnlockAt(): number {
    const raw = this.notesStorageService.getAppLastUnlockAt();
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return parsed;
  }
  public clearAppWipeSchedule() {
    this.notesStorageService.removeAppWipeAfterDays();
    this.notesStorageService.removeAppLastUnlockAt();
  }
  public getLastActivityTimestamp() {
    return this.LAST_ACTIVITY_TIMESTAMP;
  }
  public setClipboardAutoClearSeconds(seconds: number) {
    const allowed = [0, 30, 60, 120];
    const normalized = allowed.includes(seconds) ? seconds : 30;
    this.notesStorageService.setClipboardAutoClearSeconds(String(normalized));
  }
  public getClipboardAutoClearSeconds(): number {
    const raw = this.notesStorageService.getClipboardAutoClearSeconds();
    const parsed = Number(raw);
    const allowed = [0, 30, 60, 120];
    if (!Number.isFinite(parsed) || !allowed.includes(parsed)) {
      return 30;
    }
    return parsed;
  }
  public setPrivacyModeEnabled(enabled: boolean) {
    if (enabled) {
      this.notesStorageService.setPrivacyModeEnabled('1');
      return;
    }
    this.notesStorageService.removePrivacyModeEnabled();
  }
  public isPrivacyModeEnabled(): boolean {
    return this.notesStorageService.getPrivacyModeEnabled() === '1';
  }
}
