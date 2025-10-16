import { Component } from '@angular/core';
import { TranslatorService } from './services/translator.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Storage as IonicStorage } from '@ionic/storage-angular';
import {SyncWorkerService} from "./services/sync-worker.service";

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {

  constructor(private translator: TranslatorService, private storage: IonicStorage, private syncWorker: SyncWorkerService) {

    this.syncWorker.init();
    console.log('AppComponent');
    (async () => {
      await this.storage.create();
      await this.storage.set('__driver_probe', 'ok');
      const val = await this.storage.get('__driver_probe');
      console.log('[Storage] driver OK, read:', val); // expect 'ok'
    })();

    StatusBar.setBackgroundColor({color: '#F6F6FD'}).then(r => {});
    StatusBar.setStyle({style: Style.Light}).then(r => {});

    if (typeof navigator !== "undefined") {
      this.translator.loadTranslations("./assets/i18n/").subscribe(() => {});
    }
  }


}
