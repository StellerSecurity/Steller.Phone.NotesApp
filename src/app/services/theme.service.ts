import { Injectable } from '@angular/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Storage as IonicStorage } from '@ionic/storage-angular';

export type AppearanceMode = 'system' | 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly storageKey = 'ssAppearanceMode';
  private readonly darkClass = 'stellar-dark-theme';
  private mediaQuery: MediaQueryList | null = null;
  private currentMode: AppearanceMode = 'system';
  private storageReady: Promise<IonicStorage> | null = null;

  constructor(private storage: IonicStorage) {}

  public async initialize(): Promise<void> {
    this.mediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

    if (this.mediaQuery) {
      const handleSystemThemeChange = () => {
        if (this.currentMode === 'system') {
          void this.applyAppearance(this.currentMode);
        }
      };

      if (typeof this.mediaQuery.addEventListener === 'function') {
        this.mediaQuery.addEventListener('change', handleSystemThemeChange);
      } else if (typeof this.mediaQuery.addListener === 'function') {
        this.mediaQuery.addListener(handleSystemThemeChange);
      }
    }

    const storedMode = await this.getStoredAppearanceMode();
    this.currentMode = storedMode;
    await this.applyAppearance(storedMode);
  }

  public async getAppearanceMode(): Promise<AppearanceMode> {
    return this.getStoredAppearanceMode();
  }

  public async setAppearanceMode(mode: AppearanceMode): Promise<void> {
    this.currentMode = mode;
    const storage = await this.getStorage();
    await storage.set(this.storageKey, mode);
    await this.applyAppearance(mode);
  }

  public getAppearanceOptions(): Array<{ value: AppearanceMode; labelKey: string }> {
    return [
      { value: 'system', labelKey: 'appearanceSystem' },
      { value: 'light', labelKey: 'appearanceLight' },
      { value: 'dark', labelKey: 'appearanceDark' },
    ];
  }

  private async getStoredAppearanceMode(): Promise<AppearanceMode> {
    const storage = await this.getStorage();
    const mode = await storage.get(this.storageKey);

    if (mode === 'light' || mode === 'dark' || mode === 'system') {
      return mode;
    }

    return 'system';
  }

  private async getStorage(): Promise<IonicStorage> {
    if (!this.storageReady) {
      this.storageReady = this.storage.create();
    }

    return this.storageReady;
  }

  private async applyAppearance(mode: AppearanceMode): Promise<void> {
    const resolvedDark = mode === 'dark' || (mode === 'system' && this.prefersDarkMode());
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const body = typeof document !== 'undefined' ? document.body : null;

    root?.classList.toggle(this.darkClass, resolvedDark);
    root?.classList.toggle('ion-palette-dark', resolvedDark);
    body?.classList.toggle(this.darkClass, resolvedDark);
    body?.classList.toggle('ion-palette-dark', resolvedDark);

    try {
      await StatusBar.setBackgroundColor({ color: resolvedDark ? '#0B1020' : '#F6F6FD' });
      await StatusBar.setStyle({ style: resolvedDark ? Style.Dark : Style.Light });
    } catch {
      // StatusBar is not available on every platform. Theme application should still continue.
    }
  }

  private prefersDarkMode(): boolean {
    return !!this.mediaQuery?.matches;
  }
}
