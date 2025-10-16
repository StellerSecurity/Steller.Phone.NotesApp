import { Injectable } from '@angular/core';
import {Router} from "@angular/router";
import {SecureStorageService} from "./secure-storage.service";
import { Preferences } from '@capacitor/preferences';
import {wipeApp} from "./wipe-app.util";
import { Storage } from '@ionic/storage-angular';
import {ResetService} from "./reset.service";


@Injectable({
  providedIn: 'root'
})
export class DataService {

    constructor(private secureStorageService: SecureStorageService, private storage: Storage, private resetService: ResetService) { }

    private forceDownloadOnHome = false;

    public setForceDownloadOnHome(forceDownloadOnHome: boolean) {
        this.forceDownloadOnHome = forceDownloadOnHome;
    }

    public getForceDownloadOnHome() {
        return this.forceDownloadOnHome;
    }

    public async clearAppData() {
      console.log('Wiping data..');
      await this.resetService.factoryReset({
        extraIndexedDbNames: ['__stellar_notes'], // your DB name from IonicStorageModule
        // sqliteDbNames: ['appdb'],              // if you use SQLite
        // clearSecureStorage: true,              // if you use a secure store
        alsoUnregisterSW: false,                  // set true for PWA full reset
      });
    }

}
