import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';

@Injectable({
  providedIn: 'root',
})
export class AppHapticsService {
  private static readonly HAPTICS_ENABLED_KEY = 'haptics_enabled';

  private static readonly MIN_GAP_LIGHT_MS = 45;
  private static readonly MIN_GAP_MEDIUM_MS = 70;
  private static readonly MIN_GAP_NOTIFICATION_MS = 140;
  private static readonly MIN_GAP_SELECTION_CHANGED_MS = 55;
  private static readonly MIN_GAP_SELECTION_STATE_MS = 90;

  private enabled = true;
  private loadPreferencePromise: Promise<void> | null = null;

  private lastAnyHapticAt = 0;
  private lastLightAt = 0;
  private lastMediumAt = 0;
  private lastNotificationAt = 0;
  private lastSelectionChangedAt = 0;
  private lastSelectionStateAt = 0;

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
      // Haptics preference persistence should never break the app.
    }
  }

  private now(): number {
    return Date.now();
  }

  private canFire(lastAt: number, minGapMs: number): boolean {
    return this.now() - lastAt >= minGapMs;
  }

  private markAny(): void {
    this.lastAnyHapticAt = this.now();
  }

  private async run(
    action: () => Promise<void>,
    options?: {
      minGapMs?: number;
      channel?: 'light' | 'medium' | 'notification' | 'selectionChanged' | 'selectionState';
    }
  ): Promise<void> {
    await this.ensurePreferenceLoaded();

    if (!this.shouldPlay) {
      return;
    }

    const minGapMs = options?.minGapMs ?? 0;
    const channel = options?.channel;

    if (channel === 'light' && !this.canFire(this.lastLightAt, minGapMs)) {
      return;
    }

    if (channel === 'medium' && !this.canFire(this.lastMediumAt, minGapMs)) {
      return;
    }

    if (channel === 'notification' && !this.canFire(this.lastNotificationAt, minGapMs)) {
      return;
    }

    if (channel === 'selectionChanged' && !this.canFire(this.lastSelectionChangedAt, minGapMs)) {
      return;
    }

    if (channel === 'selectionState' && !this.canFire(this.lastSelectionStateAt, minGapMs)) {
      return;
    }

    try {
      await action();

      const now = this.now();
      this.markAny();

      if (channel === 'light') {
        this.lastLightAt = now;
      } else if (channel === 'medium') {
        this.lastMediumAt = now;
      } else if (channel === 'notification') {
        this.lastNotificationAt = now;
      } else if (channel === 'selectionChanged') {
        this.lastSelectionChangedAt = now;
      } else if (channel === 'selectionState') {
        this.lastSelectionStateAt = now;
      }
    } catch {
      // Haptics should never break the primary flow.
    }
  }

  // --------------------------------------------------
  // Premium semantic API
  // --------------------------------------------------

  tap(): Promise<void> {
    return this.light();
  }

  light(): Promise<void> {
    return this.run(
      () => Haptics.impact({ style: ImpactStyle.Light }),
      {
        minGapMs: AppHapticsService.MIN_GAP_LIGHT_MS,
        channel: 'light',
      }
    );
  }

  medium(): Promise<void> {
    return this.run(
      () => Haptics.impact({ style: ImpactStyle.Medium }),
      {
        minGapMs: AppHapticsService.MIN_GAP_MEDIUM_MS,
        channel: 'medium',
      }
    );
  }

  heavy(): Promise<void> {
    return this.run(
      () => Haptics.impact({ style: ImpactStyle.Heavy }),
      {
        minGapMs: AppHapticsService.MIN_GAP_MEDIUM_MS,
        channel: 'medium',
      }
    );
  }

  success(): Promise<void> {
    return this.run(
      () => Haptics.notification({ type: NotificationType.Success }),
      {
        minGapMs: AppHapticsService.MIN_GAP_NOTIFICATION_MS,
        channel: 'notification',
      }
    );
  }

  warning(): Promise<void> {
    return this.run(
      () => Haptics.notification({ type: NotificationType.Warning }),
      {
        minGapMs: AppHapticsService.MIN_GAP_NOTIFICATION_MS,
        channel: 'notification',
      }
    );
  }

  error(): Promise<void> {
    return this.run(
      () => Haptics.notification({ type: NotificationType.Error }),
      {
        minGapMs: AppHapticsService.MIN_GAP_NOTIFICATION_MS,
        channel: 'notification',
      }
    );
  }

  // --------------------------------------------------
  // Selection-style interactions
  // --------------------------------------------------

  selectionStart(): Promise<void> {
    return this.run(
      () => Haptics.selectionStart(),
      {
        minGapMs: AppHapticsService.MIN_GAP_SELECTION_STATE_MS,
        channel: 'selectionState',
      }
    );
  }

  selectionChanged(): Promise<void> {
    return this.run(
      () => Haptics.selectionChanged(),
      {
        minGapMs: AppHapticsService.MIN_GAP_SELECTION_CHANGED_MS,
        channel: 'selectionChanged',
      }
    );
  }

  selectionEnd(): Promise<void> {
    return this.run(
      () => Haptics.selectionEnd(),
      {
        minGapMs: AppHapticsService.MIN_GAP_SELECTION_STATE_MS,
        channel: 'selectionState',
      }
    );
  }

  // --------------------------------------------------
  // Backward-compatible aliases
  // --------------------------------------------------

  impactLight(): Promise<void> {
    return this.light();
  }

  impactMedium(): Promise<void> {
    return this.medium();
  }

  impactHeavy(): Promise<void> {
    return this.heavy();
  }
}
