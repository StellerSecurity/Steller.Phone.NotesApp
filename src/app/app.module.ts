import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';

import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { ShareSecretModalComponent } from './share-secret-modal/share-secret-modal.component';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';

import * as sodium from 'libsodium-wrappers-sumo';

import { IonicStorageModule } from '@ionic/storage-angular';
import { Drivers } from '@ionic/storage';
import { PsmZxcvbnService } from './services/psm-zxcvbn.service';
import { NotesStorageService } from './services/notes-storage.service';
import { DataService } from './services/data.service';

export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http);
}

export function initSodium() {
  return async () => {
    await sodium.ready;
  };
}

export function initNotesStorage(notesStorageService: NotesStorageService) {
  return async () => {
    await notesStorageService.init();
  };
}

export function initWipeProtection(dataService: DataService) {
  return async () => {
    await dataService.initializeWipeProtection();
  };
}

@NgModule({
  declarations: [
    AppComponent,
    ShareSecretModalComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CommonModule,
    FormsModule,
    HttpClientModule,

    IonicModule.forRoot({ innerHTMLTemplatesEnabled: true }),

    IonicStorageModule.forRoot({
      name: '__stellar_notes',
      driverOrder: [
        Drivers.IndexedDB,
        Drivers.LocalStorage,
      ],
    }),

    ToastrModule.forRoot({
      timeOut: 3000,
      positionClass: 'toast-bottom-center',
      preventDuplicates: true,
    }),

    PasswordStrengthMeterModule.forRoot({
      serviceClass: PsmZxcvbnService,
    }),

    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),

    AppRoutingModule,
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    {
      provide: APP_INITIALIZER,
      useFactory: initSodium,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initNotesStorage,
      deps: [NotesStorageService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initWipeProtection,
      deps: [DataService],
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
