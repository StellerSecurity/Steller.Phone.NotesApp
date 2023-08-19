import { Injectable } from '@angular/core';
import {NotesService} from "./notes.service";
import { App } from '@capacitor/app';

@Injectable({
  providedIn: 'root'
})
export class AppProtectorService {
  constructor(private noteService: NotesService) { }

  public init() {
    this.checkForInActivity();
  }

  private checkForInActivity() {

    let last_activity_time = this.noteService.getLastActivityTimestamp();

    if(last_activity_time !== 0) {
      let current_timestamp = Date.now();
      // inactive for 5 minutes, close the app.
      if(last_activity_time <= current_timestamp - 300000) {
        this.noteService.setNotesAppPassword("");
        window.location.href = '/home';
        console.log("INACTIVE 5 MINUTES !");
        // @ts-ignore
        if(navigator['app'] !== undefined) {
          // @ts-ignore
          navigator['app'].exitApp();
        }

      }
    }


    App.getState().then(data => {
      console.log(data.isActive);
      if(data.isActive) {
        this.noteService.setLastActivityTimestamp(Date.now());
        console.log(this.noteService.getLastActivityTimestamp() + " spank mig hårdt...");
      }

    });

    setTimeout(() => { this.checkForInActivity() }, 1000);


  }

}
