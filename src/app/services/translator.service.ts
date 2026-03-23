import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { map } from "rxjs";
import * as EnLangTranslations from "src/assets/i18n/en.json";
import * as DaLangTranslations from "src/assets/i18n/da.json";
import * as DeLangTranslations from "src/assets/i18n/de.json";
import * as FrLangTranslations from "src/assets/i18n/fr.json";
import * as SeLangTranslations from "src/assets/i18n/se.json";

@Injectable({
  providedIn: "root",
})
export class TranslatorService {
  language: string = "en";
  allTranslations: any;

  private readonly supportedLanguages = ["en", "da", "de", "fr", "se"];

  constructor(private http: HttpClient, private translate: TranslateService) {
    this.language = this.resolveLanguage();
    this.loadTranslationsFromJsonFile();
  }

  private resolveLanguage(): string {
    const raw =
      (typeof navigator !== "undefined" ? navigator.language : "") ||
      this.translate.getBrowserLang() ||
      "en";

    const normalized = raw.toLowerCase().split("-")[0];

    // Map Swedish locale to your existing se.json file
    if (normalized === "sv") {
      return "se";
    }

    return this.supportedLanguages.includes(normalized) ? normalized : "en";
  }

  private getBundledTranslations(lang: string): any {
    switch (lang) {
      case "da":
        return DaLangTranslations;
      case "de":
        return DeLangTranslations;
      case "fr":
        return FrLangTranslations;
      case "se":
        return SeLangTranslations;
      case "en":
      default:
        return EnLangTranslations;
    }
  }

  loadTranslationsFromJsonFile(): void {
    this.translate.addLangs(this.supportedLanguages);

    this.allTranslations = this.getBundledTranslations(this.language);

    this.translate.setTranslation(this.language, this.allTranslations, true);
    this.translate.setDefaultLang(this.language);
    this.translate.use(this.language);
  }

  loadTranslations(data: any) {
    this.language = this.resolveLanguage();

    this.translate.addLangs(this.supportedLanguages);
    this.translate.setDefaultLang(this.language);
    this.translate.use(this.language);

    return this.http.get(`${data}${this.language}.json`).pipe(
      map((translations: any) => {
        this.allTranslations = translations;
        this.translate.setTranslation(this.language, translations, true);
        return translations;
      })
    );
  }

  setLanguage(lang: string) {
    const normalized = lang.toLowerCase().split("-")[0];
    const finalLang =
      normalized === "sv"
        ? "se"
        : this.supportedLanguages.includes(normalized)
          ? normalized
          : "en";

    this.language = finalLang;
    this.loadTranslationsFromJsonFile();
  }
}
