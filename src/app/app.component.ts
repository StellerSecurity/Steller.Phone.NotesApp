import { Component } from '@angular/core';
import { TranslatorService } from './services/translator.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent {
  
  constructor(private translator: TranslatorService) {
    if (typeof navigator !== "undefined") {
      this.translator.loadTranslations("./assets/i18n/").subscribe(() => {});
    }
  }
}
