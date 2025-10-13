import { Injectable } from '@angular/core';

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

    private forceDownloadOnHome = false;

    public setForceDownloadOnHome(forceDownloadOnHome: boolean) {
        this.forceDownloadOnHome = forceDownloadOnHome;
    }

    public getForceDownloadOnHome() {
        return this.forceDownloadOnHome;
    }

}
