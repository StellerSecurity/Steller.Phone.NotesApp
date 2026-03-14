import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { NotesService } from './notes.service';

@Injectable({
  providedIn: 'root'
})
export class AppProtectorService {
  private inactivityTimerId: number | null = null;
  private started = false;
  private backgroundedAt = 0;
  private readonly activityEvents = ['click', 'keydown', 'touchstart', 'mousedown'];
  private readonly boundRecordActivity = () => this.recordActivity();

  constructor(private noteService: NotesService) {}

  public init() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.backgroundedAt = 0;
    this.recordActivity();
    this.installActivityListeners();

    App.addListener('appStateChange', ({ isActive }) => {
      if (!this.noteService.appHasPasswordChallenge()) {
        return;
      }

      if (isActive) {
        const timeoutMs = this.getTimeoutMs();
        if (this.backgroundedAt !== 0 && Date.now() - this.backgroundedAt >= timeoutMs) {
          this.lockNow();
          return;
        }

        this.backgroundedAt = 0;
        this.recordActivity();
        return;
      }

      this.backgroundedAt = Date.now();
    });

    this.checkForInActivity();
  }

  public stop() {
    if (this.inactivityTimerId !== null) {
      window.clearTimeout(this.inactivityTimerId);
      this.inactivityTimerId = null;
    }

    this.removeActivityListeners();
    this.started = false;
    this.backgroundedAt = 0;
  }

  private getTimeoutMs(): number {
    return this.noteService.getAppLockTimeoutMinutes() * 60_000;
  }

  private installActivityListeners() {
    this.activityEvents.forEach((eventName) => {
      document.addEventListener(eventName, this.boundRecordActivity, true);
    });
  }

  private removeActivityListeners() {
    this.activityEvents.forEach((eventName) => {
      document.removeEventListener(eventName, this.boundRecordActivity, true);
    });
  }

  private recordActivity() {
    if (!this.noteService.appHasPasswordChallenge()) {
      return;
    }

    if (this.noteService.getNotesAppPassword() === '') {
      return;
    }

    this.noteService.setLastActivityTimestamp(Date.now());
  }

  private lockNow() {
    this.noteService.setNotesAppPassword('');
    this.noteService.setDecryptedNotes(null);
    this.noteService.setLastActivityTimestamp(0);
    this.stop();
    window.location.href = '/';
  }

  private checkForInActivity() {
    const lastActivityTime = this.noteService.getLastActivityTimestamp();

    if (lastActivityTime !== 0) {
      const currentTimestamp = Date.now();
      if (currentTimestamp - lastActivityTime >= this.getTimeoutMs()) {
        this.lockNow();
        return;
      }
    }

    this.inactivityTimerId = window.setTimeout(() => {
      this.checkForInActivity();
    }, 1000);
  }
}
