import { Injectable } from '@angular/core';
import { PrivacyScreen } from '@capacitor/privacy-screen';
import { Preferences } from '@capacitor/preferences';

@Injectable({
  providedIn: 'root'
})
export class ScreenshotProtectionService {
  private readonly SCREENSHOT_PROTECTION_KEY = 'screenshot_protection_enabled';

  async isEnabled(): Promise<boolean> {
    const { value } = await Preferences.get({ key: this.SCREENSHOT_PROTECTION_KEY });

    if (value === null) {
      return true;
    }

    return value === 'true';
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await Preferences.set({
      key: this.SCREENSHOT_PROTECTION_KEY,
      value: String(enabled)
    });
  }

  async applyCurrentSetting(appLockEnabled: boolean): Promise<void> {
    const screenshotsEnabled = await this.isEnabled();

    if (!appLockEnabled || !screenshotsEnabled) {
      await PrivacyScreen.disable();
      return;
    }

    await PrivacyScreen.enable({
      android: {
        dimBackground: true,
        preventScreenshots: true,
        privacyModeOnActivityHidden: 'splash'
      },
      ios: {
        blurEffect: 'dark'
      }
    });
  }
}
