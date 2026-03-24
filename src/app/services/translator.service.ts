import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Preferences } from "@capacitor/preferences";
import { map } from "rxjs";
import * as EnLangTranslations from "src/assets/i18n/en.json";
import * as EsLangTranslations from "src/assets/i18n/es.json";
import * as NlLangTranslations from "src/assets/i18n/nl.json";
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
  private readonly LANGUAGE_PREFERENCE_KEY = "app_language";
  private readonly supportedLanguages = ["en", "es", "nl", "da", "de", "fr", "se"];
  constructor(private http: HttpClient, private translate: TranslateService) {
    this.loadTranslationsFromJsonFile().then(() => {});
  }
  private normalizeLanguage(lang: string): string {
    const normalized = lang.toLowerCase().split("-")[0];
    if (normalized === "sv") {
      return "se";
    }
    return this.supportedLanguages.includes(normalized) ? normalized : "en";
  }
  private resolveSystemLanguage(): string {
    const raw =
      (typeof navigator !== "undefined" ? navigator.language : "") ||
      this.translate.getBrowserLang() ||
      "en";
    return this.normalizeLanguage(raw);
  }
  private async resolveLanguage(): Promise<string> {
    const { value } = await Preferences.get({ key: this.LANGUAGE_PREFERENCE_KEY });
    if (!value || value === "system") {
      return this.resolveSystemLanguage();
    }
    return this.normalizeLanguage(value);
  }
  private getBundledTranslations(lang: string): any {
    switch (lang) {
      case "es":
        return EsLangTranslations;
      case "nl":
        return NlLangTranslations;
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
  async getLanguagePreference(): Promise<string> {
    const { value } = await Preferences.get({ key: this.LANGUAGE_PREFERENCE_KEY });
    return value ?? "system";
  }
  getSupportedLanguageOptions() {
    return [
      { value: "system", labelKey: "usePhoneLanguage" },
      { value: "en", label: "English" },
      { value: "es", label: "Español" },
      { value: "nl", label: "Nederlands" },
      { value: "de", label: "Deutsch" },
      { value: "da", label: "Dansk" },
      { value: "fr", label: "Français" },
      { value: "se", label: "Svenska" },
    ];
  }
  async loadTranslationsFromJsonFile(): Promise<void> {
    this.language = await this.resolveLanguage();
    this.translate.addLangs(this.supportedLanguages);
    this.allTranslations = this.getBundledTranslations(this.language);
    this.translate.setTranslation(this.language, this.allTranslations, true);
    this.translate.setDefaultLang(this.language);
    this.translate.use(this.language);
  }
  loadTranslations(data: any) {
    return this.http.get(`${data}${this.language}.json`).pipe(
      map((translations: any) => {
        this.allTranslations = translations;
        this.translate.setTranslation(this.language, translations, true);
        return translations;
      })
    );
  }
  async setLanguage(lang: string) {
    const finalLang = lang === "system" ? "system" : this.normalizeLanguage(lang);
    await Preferences.set({
      key: this.LANGUAGE_PREFERENCE_KEY,
      value: finalLang,
    });
    await this.loadTranslationsFromJsonFile();
  }
}
