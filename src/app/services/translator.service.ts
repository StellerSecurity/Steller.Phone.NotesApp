import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { map } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class TranslatorService {
  hostName: string = "";
  allTranslations:any;

  constructor(
    private http: HttpClient,
    private translate: TranslateService
  ) {
  }

  loadTranslations(data: any) {
    let language = "en";
    this.translate.addLangs(["en", "de", "da", "se"]);

    this.translate.setDefaultLang(language);
    this.translate.use(language);

    return this.http.get(`${data}${language}.json`).pipe(
      map((translations: any) => {
        console.log('translations', translations)
        this.allTranslations = translations
        this.translate.setTranslation(language, translations);
        return translations; // Return the loaded translations
      })
    );
  }
}
