import { Injectable } from '@angular/core';
import { Storage as IonicStorage } from '@ionic/storage-angular';

@Injectable({
  providedIn: 'root'
})
export class NotesStorageService {
  private static readonly MIGRATION_VERSION = '1';
  private readonly MIGRATION_VERSION_KEY = 'storage_migration_version';
  private readonly managedKeys = [
    'notes',
    'app_password_challenge',
    'failedAttemptsApp',
    'app_lockout_until',
    'app_lock_timeout_minutes',
  ] as const;

  private cache = new Map<string, string | null>();
  private ready: Promise<void>;

  constructor(private storage: IonicStorage) {
    this.ready = this.initInternal();
  }

  public async init(): Promise<void> {
    await this.ready;
  }

  private async initInternal(): Promise<void> {
    await this.storage.create();
    await this.migrateLegacyIfNeeded();
    await this.primeCache();
  }

  private async migrateLegacyIfNeeded(): Promise<void> {
    const migratedVersion = await this.storage.get(this.MIGRATION_VERSION_KEY);
    if (migratedVersion === NotesStorageService.MIGRATION_VERSION) {
      return;
    }

    for (const key of this.managedKeys) {
      const existing = await this.storage.get(key);
      if (existing !== null && existing !== undefined) {
        continue;
      }

      const legacy = this.readLegacy(key);
      if (legacy !== null) {
        await this.storage.set(key, legacy);
      }
    }

    await this.storage.set(this.MIGRATION_VERSION_KEY, NotesStorageService.MIGRATION_VERSION);
  }

  private async primeCache(): Promise<void> {
    for (const key of this.managedKeys) {
      const value = await this.storage.get(key);
      this.cache.set(key, value ?? null);
    }
  }

  private readLegacy(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  public getValue(key: string): string | null {
    if (this.cache.has(key)) {
      return this.cache.get(key) ?? null;
    }

    return this.readLegacy(key);
  }

  public setValue(key: string, value: string): void {
    this.cache.set(key, value);
    void this.persistValue(key, value);
  }

  public removeValue(key: string): void {
    this.cache.set(key, null);
    void this.persistRemoval(key);
  }

  public getNotesRaw(): string {
    return this.getValue('notes') ?? '[]';
  }

  public setNotesRaw(raw: string): void {
    this.setValue('notes', raw);
  }

  public getAppPasswordChallengeFlag(): string | null {
    return this.getValue('app_password_challenge');
  }

  public setAppPasswordChallengeFlag(value: string): void {
    this.setValue('app_password_challenge', value);
  }

  public removeAppPasswordChallengeFlag(): void {
    this.removeValue('app_password_challenge');
  }

  public getFailedAttempts(): string | null {
    return this.getValue('failedAttemptsApp');
  }

  public setFailedAttempts(value: string): void {
    this.setValue('failedAttemptsApp', value);
  }

  public removeFailedAttempts(): void {
    this.removeValue('failedAttemptsApp');
  }

  public getAppLockoutUntil(): string | null {
    return this.getValue('app_lockout_until');
  }

  public setAppLockoutUntil(value: string): void {
    this.setValue('app_lockout_until', value);
  }

  public removeAppLockoutUntil(): void {
    this.removeValue('app_lockout_until');
  }

  public getAppLockTimeoutMinutes(): string | null {
    return this.getValue('app_lock_timeout_minutes');
  }

  public setAppLockTimeoutMinutes(value: string): void {
    this.setValue('app_lock_timeout_minutes', value);
  }

  public removeAppLockTimeoutMinutes(): void {
    this.removeValue('app_lock_timeout_minutes');
  }

  public async clearManagedData(): Promise<void> {
    await this.init();

    for (const key of this.managedKeys) {
      this.cache.set(key, null);
      await this.storage.remove(key);
      try {
        localStorage.removeItem(key);
      } catch {}
    }

    await this.storage.remove(this.MIGRATION_VERSION_KEY);
  }

  public async clearValuesByPrefixes(prefixes: string[]): Promise<void> {
    await this.init();

    const storedKeys = await this.storage.keys();
    for (const key of storedKeys) {
      if (!prefixes.some(prefix => key.startsWith(prefix))) {
        continue;
      }

      this.cache.delete(key);
      await this.storage.remove(key);
    }

    try {
      const legacyKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && prefixes.some(prefix => key.startsWith(prefix))) {
          legacyKeys.push(key);
        }
      }

      for (const key of legacyKeys) {
        localStorage.removeItem(key);
      }
    } catch {}
  }

  private async persistValue(key: string, value: string): Promise<void> {
    await this.init();
    await this.storage.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  private async persistRemoval(key: string): Promise<void> {
    await this.init();
    await this.storage.remove(key);
    try {
      localStorage.removeItem(key);
    } catch {}
  }
}
