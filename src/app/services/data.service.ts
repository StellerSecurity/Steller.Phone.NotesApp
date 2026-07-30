import { Injectable } from '@angular/core';
import { SecureStorageService } from "./secure-storage.service";
import { Preferences } from '@capacitor/preferences';
import { NotesStorageService } from './notes-storage.service';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { BackgroundNotesSyncService } from './background-notes-sync.service';
import { AuthService } from './auth.service';
import { BiometricUnlockService } from './biometric-unlock.service';
import { CryptoKeyService } from './crypto-key.service';
import { NotesService } from './notes.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private static readonly WIPE_PENDING_KEY = 'wipe_pending';
  private static readonly APP_DB_NAME = '__stellar_notes';

  private wipeInProgress: Promise<void> | null = null;
  private forceDownloadOnHome = false;

  constructor(
    private secureStorageService: SecureStorageService,
    private notesStorageService: NotesStorageService,
    private backgroundSync: BackgroundNotesSyncService,
    private authService: AuthService,
    private biometricUnlockService: BiometricUnlockService,
    private cryptoKeyService: CryptoKeyService,
    private notesService: NotesService
  ) { }

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

  private async markWipePending(): Promise<void> {
    await Preferences.set({
      key: DataService.WIPE_PENDING_KEY,
      value: '1',
    });
  }

  private async clearWipePending(): Promise<void> {
    await Preferences.remove({
      key: DataService.WIPE_PENDING_KEY,
    });
  }

  private async isWipePending(): Promise<boolean> {
    const result = await Preferences.get({
      key: DataService.WIPE_PENDING_KEY,
    });
    return result.value === '1';
  }

  private async clearBrowserStorage(): Promise<void> {
    try {
      sessionStorage.clear();
    } catch {}

    try {
      localStorage.clear();
    } catch {}
  }

  private async clearCacheStorage(): Promise<void> {
    if (typeof caches === 'undefined') {
      return;
    }

    try {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    } catch {}
  }

  private async deleteIndexedDbDatabase(name: string): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return;
    }

    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onblocked = () => resolve();
      req.onerror = () => resolve();
    });
  }

  private async wipeDir(dir: Directory): Promise<void> {
    try {
      const list: any = await Filesystem.readdir({ directory: dir, path: '' });
      const files = list.files ?? list;

      for (const entry of files) {
        const name = typeof entry === 'string' ? entry : entry.name;
        await Filesystem.deleteFile({ directory: dir, path: name }).catch(() =>
          Filesystem.rmdir({ directory: dir, path: name, recursive: true }).catch(() => {})
        );
      }
    } catch {}
  }

  public async initializeWipeProtection(): Promise<void> {
    if (await this.isWipePending()) {
      await this.clearAppData();
      return;
    }

    await this.performInactiveWipeIfNeeded();
  }

  public async performInactiveWipeIfNeeded(): Promise<void> {
    const wipeDaysRaw = this.notesStorageService.getAppWipeAfterDays();
    const wipeDays = wipeDaysRaw ? Number(wipeDaysRaw) : 0;

    if (!wipeDays || wipeDays <= 0) {
      return;
    }

    const lastUnlockRaw = this.notesStorageService.getAppLastUnlockAt();
    const lastUnlockTs = lastUnlockRaw ? Number(lastUnlockRaw) : 0;

    if (!lastUnlockTs || lastUnlockTs <= 0) {
      return;
    }

    const wipeAfterMs = wipeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (now - lastUnlockTs < wipeAfterMs) {
      return;
    }

    await this.clearAppData();
  }

  public async clearAppData(): Promise<void> {
    if (this.wipeInProgress) {
      await this.wipeInProgress;
      return;
    }

    this.wipeInProgress = (async () => {
      this.authService.clearAuthenticationState();
      this.cryptoKeyService.clearRuntimeKeys();
      this.notesService.clearSensitiveRuntimeState();
      this.forceDownloadOnHome = false;
      await this.biometricUnlockService.clearStoredCredential();
      await this.markWipePending();

      try {
        await this.notesStorageService.flush();
        await this.secureStorageService.clear();
        await this.backgroundSync.replaceQueue([]);
        await this.backgroundSync.clearDownloaded();
        await this.notesStorageService.clearManagedData();
        await this.clearLegacyNoteUnlockState();
        await this.clearBrowserStorage();
        await this.clearCacheStorage();
        await this.deleteIndexedDbDatabase(DataService.APP_DB_NAME);
        await this.wipeDir(Directory.Cache);
        await this.wipeDir(Directory.Data);
        await Preferences.clear();
      } finally {
        try {
          await this.clearWipePending();
        } catch {}
        this.wipeInProgress = null;
      }
    })();

    await this.wipeInProgress;
  }
}
