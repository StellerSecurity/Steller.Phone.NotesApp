import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

@Injectable({
  providedIn: 'root',
})
export class AppHapticsService {
  private get shouldPlay(): boolean {
    try {
      return Capacitor.getPlatform() !== 'web';
    } catch {
      return false;
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
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
