import { Injectable } from '@angular/core';
import {Router} from "@angular/router";
import {SecureStorageService} from "./secure-storage.service";
import { Preferences } from '@capacitor/preferences';
import { NotesStorageService } from './notes-storage.service';
import { Filesystem, Directory } from '@capacitor/filesystem';

@Injectable({
  providedIn: 'root'
})
export class DataService {

    constructor(
      private secureStorageService: SecureStorageService,
      private notesStorageService: NotesStorageService
    ) { }

    private forceDownloadOnHome = false;

    public setForceDownloadOnHome(forceDownloadOnHome: boolean) {
        this.forceDownloadOnHome = forceDownloadOnHome;
    }

    public getForceDownloadOnHome() {
        return this.forceDownloadOnHome;
    }


    private async clearLegacyNoteUnlockState() {
      await this.notesStorageService.clearValuesByPrefixes([
        'note_failed_attempts_',
        'note_lockout_until_',
      ]);
    }

    public async clearAppData() {

      await this.secureStorageService.clear();
      await this.notesStorageService.clearManagedData();
      await this.clearLegacyNoteUnlockState();
      await Preferences.clear();

      // IndexedDB wipe (no try/catch suppression)
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('__stellar_notes');
        req.onsuccess = () => resolve();
        req.onblocked = () => resolve();
        req.onerror = () => resolve();
      });

      // Delete all cache + data files
      const wipeDir = async (dir: Directory) => {
        try {
          const list: any = await Filesystem.readdir({ directory: dir, path: '' });
          const files = list.files ?? list;
          for (const e of files) {
            const name = typeof e === 'string' ? e : e.name;
            await Filesystem.deleteFile({ directory: dir, path: name }).catch(() =>
              Filesystem.rmdir({ directory: dir, path: name, recursive: true }).catch(() => {})
            );
          }
        } catch {}
      };

      await wipeDir(Directory.Cache);
      await wipeDir(Directory.Data);

    }

}
