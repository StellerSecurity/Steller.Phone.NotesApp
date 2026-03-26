import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';

@Injectable({
  providedIn: 'root',
})
export class AppHapticsService {
  private static readonly HAPTICS_ENABLED_KEY = 'haptics_enabled';
  private enabled = true;
  private loadPreferencePromise: Promise<void> | null = null;

  private get shouldPlay(): boolean {
    try {
      return Capacitor.getPlatform() !== 'web' && this.enabled;
    } catch {
      return false;
    }
  }

  private async ensurePreferenceLoaded(): Promise<void> {
    if (this.loadPreferencePromise) {
      await this.loadPreferencePromise;
      return;
    }

    this.loadPreferencePromise = (async () => {
      try {
        const { value } = await Preferences.get({
          key: AppHapticsService.HAPTICS_ENABLED_KEY,
        });

        this.enabled = value !== 'false';
      } catch {
        this.enabled = true;
      }
    })();

    await this.loadPreferencePromise;
  }

  async isEnabled(): Promise<boolean> {
    await this.ensurePreferenceLoaded();
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;

    try {
      await Preferences.set({
        key: AppHapticsService.HAPTICS_ENABLED_KEY,
        value: String(enabled),
      });
    } catch {
      // No-op by design. Preference persistence should never break the app.
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    await this.ensurePreferenceLoaded();

    if (!this.shouldPlay) {
      return;
    }

    try {
      await action();
    } catch {
      // No-op by design. Haptics should never break the primary flow.
    }
  }

  tap(): Promise<void> {
    return this.impactLight();
  }

  impactLight(): Promise<void> {
    return this.run(() => Haptics.impact({ style: ImpactStyle.Light }));
  }

  impactMedium(): Promise<void> {
    return this.run(() => Haptics.impact({ style: ImpactStyle.Medium }));
  }

  impactHeavy(): Promise<void> {
    return this.run(() => Haptics.impact({ style: ImpactStyle.Heavy }));
  }

  success(): Promise<void> {
    return this.run(() => Haptics.notification({ type: NotificationType.Success }));
  }

  warning(): Promise<void> {
    return this.run(() => Haptics.notification({ type: NotificationType.Warning }));
  }

  error(): Promise<void> {
    return this.run(() => Haptics.notification({ type: NotificationType.Error }));
  }

  selectionStart(): Promise<void> {
    return this.run(() => Haptics.selectionStart());
  }

  selectionChanged(): Promise<void> {
    return this.run(() => Haptics.selectionChanged());
  }

  selectionEnd(): Promise<void> {
    return this.run(() => Haptics.selectionEnd());
  }
}
