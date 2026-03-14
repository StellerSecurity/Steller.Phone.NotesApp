import { Component, NgZone } from '@angular/core';
import { TranslatorService } from './services/translator.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Storage as IonicStorage } from '@ionic/storage-angular';
import { SyncWorkerService } from './services/sync-worker.service';
import { NotesService } from './services/notes.service';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  public showPrivacyShield = false;

  constructor(
    private translator: TranslatorService,
    private storage: IonicStorage,
    private syncWorker: SyncWorkerService,
    private noteService: NotesService,
    private zone: NgZone
  ) {
    this.syncWorker.init();
    this.installPrivacyShield();

    StatusBar.setBackgroundColor({ color: '#F6F6FD' }).then(() => {});
    StatusBar.setStyle({ style: Style.Light }).then(() => {});

    if (typeof navigator !== 'undefined') {
      this.translator.loadTranslations('./assets/i18n/').subscribe(() => {});
    }
  }

  ngOnInit() {
    if (Capacitor.getPlatform() === 'ios') {
      Keyboard.setResizeMode({
        mode: KeyboardResize.Body
      });
    }
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
