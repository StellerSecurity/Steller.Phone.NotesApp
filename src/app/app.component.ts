import { NoteConflictService } from './services/note-conflict.service';
import { RealtimeNotesService } from './services/realtime-notes.service';
import { NotesStorageService } from './services/notes-storage.service';
import { Component, NgZone } from '@angular/core';
import { TranslatorService } from './services/translator.service';
import { Storage as IonicStorage } from '@ionic/storage-angular';
import { SyncWorkerService } from './services/sync-worker.service';
import { NotesService } from './services/notes.service';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { ScreenshotProtectionService } from './services/screenshot-protection.service';
import { ThemeService } from './services/theme.service';
import { AppsflyerService } from './services/appsflyer.service';
@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  public showPrivacyShield = false;
  constructor(
    private noteConflicts: NoteConflictService,
    private realtimeNotes: RealtimeNotesService,
    private translator: TranslatorService,
    private storage: IonicStorage,
    public syncWorker: SyncWorkerService,
    public noteService: NotesService,
    private zone: NgZone,
    private screenshotProtectionService: ScreenshotProtectionService,
    private themeService: ThemeService,
    private appsflyer: AppsflyerService,
    public notesStorage: NotesStorageService
  ) {
    this.syncWorker.init();
    this.realtimeNotes.init();
    this.noteConflicts.init();
    this.installPrivacyShield();
    void this.screenshotProtectionService.applyCurrentSetting(this.noteService.appHasPasswordChallenge());
    void this.themeService.initialize();
    if (typeof navigator !== 'undefined') {
      this.initializeTranslations();
    }
    // Initialize AppsFlyer on startup (no-op on web or if plugin missing)
    void this.appsflyer.init();
    void this.appsflyer.logEventOnce('first_open', { platform: Capacitor.getPlatform() });
  }
  public async retryStorage(): Promise<void> {
    try { await this.notesStorage.retryFailedWrites(); } catch { /* Banner remains visible. */ }
  }
  ngOnInit() {
    if (Capacitor.getPlatform() === 'ios') {
      Keyboard.setResizeMode({
        mode: KeyboardResize.Body
      });
    }
  }
  private async initializeTranslations() {
    await this.translator.loadTranslationsFromJsonFile();
    this.translator.loadTranslations('./assets/i18n/').subscribe(() => {});
  }
  private installPrivacyShield() {
    App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
      this.zone.run(() => {
        this.updatePrivacyShield(!isActive);
      });
    });
    if (typeof document !== 'undefined') {
      document.addEventListener(
        'visibilitychange',
        () => {
          this.zone.run(() => {
            this.updatePrivacyShield(document.hidden);
          });
        },
        true
      );
    }
  }
  private updatePrivacyShield(shouldShow: boolean) {
    if (!this.noteService.appHasPasswordChallenge()) {
      this.showPrivacyShield = false;
      return;
    }
    this.showPrivacyShield = shouldShow;
  }
}
