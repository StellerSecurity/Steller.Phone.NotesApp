import { Injectable } from '@angular/core';
import {Router} from "@angular/router";
import {SecureStorageService} from "./secure-storage.service";
import { Preferences } from '@capacitor/preferences';

export interface Message {
  fromName: string;
  subject: string;
  date: string;
  id: number;
  read: boolean;
}

export interface Note {
  id: number,
  last_modified: number,
  text: string,
  protected: boolean,
  auto_wipe: boolean
}

@Injectable({
  providedIn: 'root'
})
export class DataService {

    constructor(private secureStorageService: SecureStorageService) { }

    private forceDownloadOnHome = false;

    public setForceDownloadOnHome(forceDownloadOnHome: boolean) {
        this.forceDownloadOnHome = forceDownloadOnHome;
    }

    public getForceDownloadOnHome() {
        return this.forceDownloadOnHome;
    }

    public clearAppData() {
        localStorage.clear();
        Preferences.clear().then((value) => {});
        this.secureStorageService.clear().then((value) => {});
    }

}
