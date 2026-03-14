import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { NotesService } from './notes.service';

@Injectable({
  providedIn: 'root'
})
export class AppProtectorService {
  private inactivityTimerId: number | null = null;

  constructor(
    private noteService: NotesService,
    private router: Router,
  ) {}

  public init() {
    if (this.inactivityTimerId !== null) {
      return;
    }

    this.checkForInActivity();
  }

  public stop() {
    if (this.inactivityTimerId !== null) {
      window.clearTimeout(this.inactivityTimerId);
      this.inactivityTimerId = null;
    }
  }

  private checkForInActivity() {
    const lastActivityTime = this.noteService.getLastActivityTimestamp();

    if (lastActivityTime !== 0) {
      const currentTimestamp = Date.now();
      // inactive for 60 minutes, close the app. (clearing services for data).
      // 600000 = 1 minute in MS.
      if (lastActivityTime <= currentTimestamp - (60 * 60000)) {
        this.noteService.setNotesAppPassword('');
        this.stop();
        this.router.navigateByUrl('/');
        return;
      }
    }

    App.getState().then((data) => {
      if (data.isActive) {
        this.noteService.setLastActivityTimestamp(Date.now());
      }
    });

    this.inactivityTimerId = window.setTimeout(() => {
      this.checkForInActivity();
    }, 1000);
  }
}
