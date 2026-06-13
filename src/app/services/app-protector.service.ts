import { Injectable } from '@angular/core';
import { App } from '@capacitor/app';
import { NotesService } from './notes.service';
import { CryptoKeyService } from './crypto-key.service';

@Injectable({
  providedIn: 'root'
})
export class AppProtectorService {
  private inactivityTimerId: number | null = null;
  private started = false;
  private backgroundedAt = 0;
  private readonly activityEvents = ['click', 'keydown', 'touchstart', 'mousedown'];
  private readonly boundRecordActivity = () => this.recordActivity();
  private readonly boundVisibilityChange = () => {
    if (typeof document === 'undefined') {
      return;
    }

    if (document.hidden) {
      this.recordBackgroundTimestamp();
      return;
    }

    this.handleReturnToForeground();
  };

  constructor(
    private noteService: NotesService,
    private cryptoKeyService: CryptoKeyService
  ) {}

  public init() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.backgroundedAt = 0;
    this.recordActivity();
    this.installActivityListeners();
    this.installVisibilityListener();

    App.addListener('appStateChange', ({ isActive }) => {
      if (!this.shouldProtectApp()) {
        return;
      }

      if (!isActive) {
        this.recordBackgroundTimestamp();
        return;
      }

      this.handleReturnToForeground();
    });

    this.checkForInActivity();
  }

  public stop() {
    if (this.inactivityTimerId !== null) {
      window.clearTimeout(this.inactivityTimerId);
      this.inactivityTimerId = null;
    }

    this.removeActivityListeners();
    this.removeVisibilityListener();
    this.started = false;
    this.backgroundedAt = 0;
  }

  public lockImmediately() {
    if (!this.shouldProtectApp()) {
      return;
    }

    this.lockNow();
  }

  private shouldProtectApp(): boolean {
    return this.noteService.appHasPasswordChallenge() && this.noteService.getNotesAppPassword() !== '';
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

  private installVisibilityListener() {
    if (typeof document === 'undefined') {
      return;
    }

    document.addEventListener('visibilitychange', this.boundVisibilityChange, true);
  }

  private removeVisibilityListener() {
    if (typeof document === 'undefined') {
      return;
    }

    document.removeEventListener('visibilitychange', this.boundVisibilityChange, true);
  }

  private recordActivity() {
    if (!this.shouldProtectApp()) {
      return;
    }

    this.noteService.setLastActivityTimestamp(Date.now());
  }

  private recordBackgroundTimestamp() {
    if (!this.shouldProtectApp()) {
      return;
    }

    const now = Date.now();
    this.backgroundedAt = now;
    this.noteService.setLastActivityTimestamp(now);
  }

  private handleReturnToForeground() {
    if (!this.shouldProtectApp()) {
      this.backgroundedAt = 0;
      return;
    }

    const timeoutMs = this.getTimeoutMs();
    const referenceTimestamp = this.backgroundedAt || this.noteService.getLastActivityTimestamp();

    if (referenceTimestamp !== 0 && Date.now() - referenceTimestamp >= timeoutMs) {
      this.lockNow();
      return;
    }

    this.backgroundedAt = 0;
    this.recordActivity();
  }

  private lockNow() {
    this.noteService.clearSensitiveRuntimeState();
    this.cryptoKeyService.clearRuntimeKeys();
    this.stop();
    window.location.href = '/';
  }

  private checkForInActivity() {
    if (!this.shouldProtectApp()) {
      this.inactivityTimerId = window.setTimeout(() => {
        this.checkForInActivity();
      }, 1000);
      return;
    }

    const lastActivityTime = this.noteService.getLastActivityTimestamp();

    if (lastActivityTime !== 0 && Date.now() - lastActivityTime >= this.getTimeoutMs()) {
      this.lockNow();
      return;
    }

    this.inactivityTimerId = window.setTimeout(() => {
      this.checkForInActivity();
    }, 1000);
  }
}
