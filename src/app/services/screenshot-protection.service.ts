import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { PrivacyScreen } from '@capacitor/privacy-screen';
import { Preferences } from '@capacitor/preferences';

const screenProtection = registerPlugin<{
  screenProtectionStatus(): Promise<{ enabled: boolean }>;
  setScreenProtection(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
}>('StellarSecurity');

@Injectable({ providedIn: 'root' })
export class ScreenshotProtectionService {
  private readonly SCREENSHOT_PROTECTION_KEY = 'screenshot_protection_enabled';

  async isEnabled(): Promise<boolean> {
    if (Capacitor.getPlatform() === 'android') return (await screenProtection.screenProtectionStatus()).enabled;
    const { value } = await Preferences.get({ key: this.SCREENSHOT_PROTECTION_KEY });
    return value !== 'false';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (Capacitor.getPlatform() === 'android') {
      const result = await screenProtection.setScreenProtection({ enabled });
      if (result.enabled !== enabled) throw new Error('screenProtectionFailed');
      return;
    }
    // iOS offers app-switcher blur, not Android's screenshot blocking.
    if (enabled) await PrivacyScreen.enable({ ios: { blurEffect: 'dark' } });
    else await PrivacyScreen.disable();
    await Preferences.set({ key: this.SCREENSHOT_PROTECTION_KEY, value: String(enabled) });
  }

  async applyCurrentSetting(_appLockEnabled?: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    // Android applies the stored setting before the WebView loads and on resume.
    if (Capacitor.getPlatform() !== 'android') await this.setEnabled(await this.isEnabled());
  }
}
