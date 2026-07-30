import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export interface BiometricAvailability {
  available: boolean;
  biometryType?: string;
}

export interface BiometricPromptLabels {
  reason: string;
  title: string;
  subtitle: string;
  description: string;
  negativeButtonText: string;
}

@Injectable({
  providedIn: 'root',
})
export class BiometricUnlockService {
  private readonly enabledKey = 'stellar_notes_biometric_unlock_enabled';
  private readonly serverKey = 'stellar-private-notes-app-lock';
  private readonly username = 'stellar-notes-app-lock';

  private get nativeBiometric(): any {
    return (window as any)?.Capacitor?.Plugins?.NativeBiometric
      ?? (Capacitor as any)?.Plugins?.NativeBiometric
      ?? null;
  }

  public async isAvailable(): Promise<BiometricAvailability> {
    const plugin = this.nativeBiometric;

    const isNativePlatform = typeof (Capacitor as any).isNativePlatform === 'function'
      ? (Capacitor as any).isNativePlatform()
      : Capacitor.getPlatform() !== 'web';

    if (!plugin || !isNativePlatform) {
      return { available: false };
    }

    try {
      const result = await plugin.isAvailable();
      return {
        available: !!result?.isAvailable || !!result?.available,
        biometryType: result?.biometryType ?? result?.biometricType,
      };
    } catch {
      return { available: false };
    }
  }

  public async isEnabled(): Promise<boolean> {
    const { value } = await Preferences.get({ key: this.enabledKey });
    return value === '1';
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      await Preferences.set({ key: this.enabledKey, value: '1' });
      return;
    }

    await this.clearStoredCredential();
  }

  public async clearStoredCredential(): Promise<void> {
    try {
      await Preferences.remove({ key: this.enabledKey });
    } catch {}

    await this.deleteStoredPassword();
  }

  public async enableWithPassword(password: string, labels?: BiometricPromptLabels): Promise<boolean> {
    const availability = await this.isAvailable();

    if (!availability.available || !password) {
      await this.setEnabled(false);
      return false;
    }

    const verified = await this.verifyIdentity(labels);

    if (!verified) {
      await this.setEnabled(false);
      return false;
    }

    await this.storePassword(password);
    await Preferences.set({ key: this.enabledKey, value: '1' });
    return true;
  }

  public async unlockWithBiometrics(labels?: BiometricPromptLabels): Promise<string | null> {
    if (!(await this.isEnabled())) {
      return null;
    }

    const availability = await this.isAvailable();

    if (!availability.available) {
      return null;
    }

    const verified = await this.verifyIdentity(labels);

    if (!verified) {
      return null;
    }

    return await this.getStoredPassword();
  }

  public async refreshStoredPassword(password: string): Promise<void> {
    if (!(await this.isEnabled()) || !password) {
      return;
    }

    await this.storePassword(password);
  }

  private async verifyIdentity(labels?: BiometricPromptLabels): Promise<boolean> {
    const plugin = this.nativeBiometric;

    if (!plugin?.verifyIdentity) {
      return false;
    }

    try {
      await plugin.verifyIdentity({
        reason: labels?.reason ?? 'Unlock Stellar Private Notes',
        title: labels?.title ?? 'Unlock Notes',
        subtitle: labels?.subtitle ?? 'Use your device biometrics to unlock your private notes.',
        description: labels?.description ?? 'Your notes remain encrypted on this device.',
        negativeButtonText: labels?.negativeButtonText ?? 'Use Password',
      });
      return true;
    } catch {
      return false;
    }
  }

  private async storePassword(password: string): Promise<void> {
    const plugin = this.nativeBiometric;

    if (!plugin?.setCredentials) {
      throw new Error('Native biometric credential storage is unavailable.');
    }

    await plugin.setCredentials({
      username: this.username,
      password,
      server: this.serverKey,
    });
  }

  private async getStoredPassword(): Promise<string | null> {
    const plugin = this.nativeBiometric;

    if (!plugin?.getCredentials) {
      return null;
    }

    try {
      const credentials = await plugin.getCredentials({ server: this.serverKey });
      return credentials?.password ?? null;
    } catch {
      return null;
    }
  }

  private async deleteStoredPassword(): Promise<void> {
    const plugin = this.nativeBiometric;

    if (!plugin?.deleteCredentials) {
      return;
    }

    try {
      await plugin.deleteCredentials({ server: this.serverKey });
    } catch {}
  }
}
