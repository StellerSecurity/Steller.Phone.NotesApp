import { BehaviorSubject } from 'rxjs';
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
    'folders',
    'app_password_challenge',
    'failedAttemptsApp',
    'app_lockout_until',
    'app_lock_timeout_minutes',
    'app_wipe_after_days',
    'app_last_unlock_at',
    'clipboard_auto_clear_seconds',
    'privacy_mode_enabled',
  ] as const;
  private cache = new Map<string, string | null>();
  private ready: Promise<void>;
  private serial: Promise<void> = Promise.resolve();
  private unsaved = new Map<string, { value: string | null }>();
  private failures = new Map<string, unknown>();
  readonly hasStorageError$ = new BehaviorSubject(false);
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
    const source = this.managedKeys.map(key => [key, this.readLegacy(key, true)] as const);
    const pending: [string, string][] = [];
    for (const [key, legacy] of source) {
      const existing = await this.storage.get(key);
      if (['notes', 'folders', 'app_password_challenge'].includes(key)
        && existing != null && legacy !== null && existing !== legacy) {
        // Keep both original stores untouched rather than combining note bytes
        // with another collection's password flag or replacing either copy.
        throw new Error('notesStorageImportConflict');
      }
      if (existing == null && legacy !== null) pending.push([key, legacy]);
    }
    // The untouched localStorage source remains the recovery copy. Do not add
    // another plaintext note archive that could outlive enabling an app code.
    for (const [key, legacy] of pending) {
      await this.storage.set(key, legacy);
      if (await this.storage.get(key) !== legacy) throw new Error('notesStorageImportIncomplete');
    }
    await this.storage.set(this.MIGRATION_VERSION_KEY, NotesStorageService.MIGRATION_VERSION);
  }
  private async primeCache(): Promise<void> {
    for (const key of this.managedKeys) {
      const value = await this.storage.get(key);
      if (!this.unsaved.has(key)) this.cache.set(key, value ?? null);
    }
  }
  /** Startup-only repair for an empty guest database with an old completion marker. */
  public async recoverLegacyIntoEmptyStore(): Promise<boolean> {
    await this.init();
    await this.flush();
    const journalKey = 'notes.localstorage.repair.v1';
    const journal = await this.storage.get(journalKey);
    if (journal?.version === 1 && journal.state === 'complete') return false;
    const emptyCollection = (value: unknown) => {
      if (value == null || value === '') return true;
      if (typeof value !== 'string') return false;
      try { const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.length === 0; }
      catch { return false; }
    };
    const target = new Map<string, string | null>();
    for (const key of this.managedKeys) target.set(key, await this.storage.get(key));
    if (!journal && (!emptyCollection(target.get('notes')) || !emptyCollection(target.get('folders'))
      || target.get('app_password_challenge') != null)) return false;
    const source = this.managedKeys.map(key => [key, this.readLegacy(key, true)] as const);
    const values = new Map<string, string | null>(source);
    if (!journal && emptyCollection(values.get('notes')) && emptyCollection(values.get('folders'))) return false;
    for (const key of ['notes.sync.outbox.v1', 'notes.design.pending-deletes.v1', 'notes.design.folders-pending.v1']) {
      const value = await this.storage.get(key);
      if (value != null && value !== false && value !== '[]' && !(Array.isArray(value) && value.length === 0)) {
        throw new Error('notesStorageImportConflict');
      }
    }
    const fingerprint = async (entries: readonly (readonly [string, string | null])[]) => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(entries)));
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    };
    const digest = await fingerprint(source);
    if (journal && (journal.version !== 1 || journal.state !== 'copying' || journal.fingerprint !== digest)) {
      throw new Error('notesStorageImportConflict');
    }
    // Do not guess at an encrypted collection or silently combine lock metadata.
    const locked = values.get('app_password_challenge') != null;
    for (const key of ['notes', 'folders']) {
      const value = values.get(key);
      if (emptyCollection(value)) continue;
      if (locked ? !/^U2FsdGVkX1[A-Za-z0-9+/]+={0,2}$/.test(value || '') : (() => {
        try { return !Array.isArray(JSON.parse(value!)); } catch { return true; }
      })()) throw new Error('notesStorageInvalid');
    }
    if (locked && emptyCollection(values.get('notes'))) throw new Error('notesStorageInvalid');
    // A stale timer must not erase the only recovery source during import.
    // Existing, populated databases retain their normal inactivity policy.
    const wipeDays = Number(values.get('app_wipe_after_days')), lastUnlock = Number(values.get('app_last_unlock_at'));
    if (locked && wipeDays > 0 && lastUnlock > 0 && Date.now() - lastUnlock >= wipeDays * 86400000) {
      throw new Error('notesStorageRecoveryExpired');
    }
    for (const [key, value] of source) {
      const existing = target.get(key);
      if (existing != null && existing !== value && !(['notes', 'folders'].includes(key) && emptyCollection(existing))) {
        throw new Error('notesStorageImportConflict');
      }
    }
    if (!journal) {
      const copying = { version: 1, state: 'copying', fingerprint: digest };
      await this.storage.set(journalKey, copying);
      if (JSON.stringify(await this.storage.get(journalKey)) !== JSON.stringify(copying)) {
        throw new Error('notesStorageImportIncomplete');
      }
    }
    for (const [key, value] of source) {
      if (value === null) continue;
      const existing = await this.storage.get(key);
      if (existing !== target.get(key)) throw new Error('notesStorageImportConflict');
      if (existing !== value) await this.storage.set(key, value);
      if (await this.storage.get(key) !== value) throw new Error('notesStorageImportIncomplete');
    }
    if (await fingerprint(this.managedKeys.map(key => [key, this.readLegacy(key, true)] as const)) !== digest) {
      throw new Error('notesStorageImportConflict');
    }
    const complete = { version: 1, state: 'complete', fingerprint: digest };
    await this.storage.set(journalKey, complete);
    if (JSON.stringify(await this.storage.get(journalKey)) !== JSON.stringify(complete)) {
      throw new Error('notesStorageImportIncomplete');
    }
    await this.primeCache();
    return true;
  }
  private readLegacy(key: string, required = false): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      if (required) throw new Error('notesStorageUnavailable');
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
    this.queueWrite(key, value);
  }
  public removeValue(key: string): void {
    this.cache.set(key, null);
    this.queueWrite(key, null);
  }
  public async flush(): Promise<void> {
    let observed: Promise<void>;
    do {
      observed = this.serial;
      await observed;
    } while (observed !== this.serial);
    if (this.failures.size) throw this.failures.values().next().value;
  }
  public async retryFailedWrites(): Promise<void> {
    for (const [key, intent] of Array.from(this.unsaved.entries())) this.queueWrite(key, intent.value);
    await this.flush();
  }
  private queueWrite(key: string, value: string | null): void {
    const intent = { value };
    this.unsaved.set(key, intent);
    this.serial = this.serial.then(async () => {
      try {
        if (value === null) await this.persistRemoval(key);
        else await this.persistValue(key, value);
        if (this.unsaved.get(key) === intent) {
          this.unsaved.delete(key);
          this.failures.delete(key);
        }
      } catch (error) {
        if (this.unsaved.get(key) === intent) this.failures.set(key, error);
      }
      this.hasStorageError$.next(this.failures.size > 0);
    });
  }
  public getNotesRaw(): string {
    return this.getValue('notes') ?? '[]';
  }
  public setNotesRaw(raw: string): void {
    this.setValue('notes', raw);
  }
  public getFoldersRaw(): string {
    return this.getValue('folders') ?? '[]';
  }
  public setFoldersRaw(raw: string): void {
    this.setValue('folders', raw);
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
  public getAppWipeAfterDays(): string | null {
    return this.getValue('app_wipe_after_days');
  }
  public setAppWipeAfterDays(value: string): void {
    this.setValue('app_wipe_after_days', value);
  }
  public removeAppWipeAfterDays(): void {
    this.removeValue('app_wipe_after_days');
  }
  public getAppLastUnlockAt(): string | null {
    return this.getValue('app_last_unlock_at');
  }
  public setAppLastUnlockAt(value: string): void {
    this.setValue('app_last_unlock_at', value);
  }
  public removeAppLastUnlockAt(): void {
    this.removeValue('app_last_unlock_at');
  }
  public getClipboardAutoClearSeconds(): string | null {
    return this.getValue('clipboard_auto_clear_seconds');
  }
  public setClipboardAutoClearSeconds(value: string): void {
    this.setValue('clipboard_auto_clear_seconds', value);
  }
  public removeClipboardAutoClearSeconds(): void {
    this.removeValue('clipboard_auto_clear_seconds');
  }
  public getPrivacyModeEnabled(): string | null {
    return this.getValue('privacy_mode_enabled');
  }
  public setPrivacyModeEnabled(value: string): void {
    this.setValue('privacy_mode_enabled', value);
  }
  public removePrivacyModeEnabled(): void {
    this.removeValue('privacy_mode_enabled');
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
