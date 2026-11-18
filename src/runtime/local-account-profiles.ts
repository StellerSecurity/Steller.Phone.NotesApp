import type { Storage } from '@ionic/storage';
import type { SecureStorageService } from '../app/services/secure-storage.service';
import type { OutboxOp } from '../app/models/Sync';

export interface LocalAccountProfile {
  notes: any[];
  folders: any[];
  outbox: OutboxOp[];
  pendingDeletes: string[];
  foldersPending: boolean;
  storage?: [string, any][];
}

export class LocalAccountProfiles {
  constructor(private disk: Storage, private secure: SecureStorageService, private clearNativeQueue: () => Promise<void> = async () => {}) {}

  private async name(id: unknown): Promise<string> {
    if (id !== 'guest' && !/^[1-9][0-9]*$/.test(String(id))) throw new Error('localAccountInvalid');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(id)));
    return 'notes.local-profile.v1:' + Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  }
  private encode(bytes: Uint8Array): string {
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  }
  private decode(text: string): Uint8Array {
    return Uint8Array.from(atob(text), byte => byte.charCodeAt(0));
  }
  async save(id: unknown, profile: LocalAccountProfile): Promise<void> {
    const name = await this.name(id);
    let raw = await this.secure.getItem(name);
    if (!raw) {
      raw = this.encode(crypto.getRandomValues(new Uint8Array(32)));
      await this.secure.setItem(name, raw);
    }
    const key = await crypto.subtle.importKey('raw', this.decode(raw), 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(name) }, key, new TextEncoder().encode(JSON.stringify(profile)));
    await this.disk.set(name, { version: 1, iv: this.encode(iv), cipher: this.encode(new Uint8Array(cipher)) });
    const saved = await this.load(id);
    if (JSON.stringify(saved) !== JSON.stringify(profile)) throw new Error('localAccountSaveFailed');
  }
  private readonly journal = 'notes.local-profile-switch.v1';
  private readonly session = 'ssLocalProfileSwitch';
  private readonly sessionKeys = ['ssToken', 'ssUser', 'ssEakB64', 'ssEakB64_Encrypted', 'ssAuthVersion', 'ssIdentitySession'];
  private readonly storageKeys = ['notes', 'folders', 'notes.sync.outbox.v1', 'notes.design.pending-deletes.v1', 'notes.design.folders-pending.v1'];

  async begin(id: unknown, profile: LocalAccountProfile): Promise<void> {
    const storage: [string, any][] = [];
    for (const key of this.storageKeys) storage.push([key, await this.disk.get(key)]);
    await this.save(id, { ...profile, storage });
    const session: [string, string | null][] = [];
    for (const key of this.sessionKeys) session.push([key, await this.secure.getItem(key)]);
    await this.secure.setItem(this.session, JSON.stringify(session));
    await this.disk.set(this.journal, { version: 1, from: id });
  }
  async commit(): Promise<void> {
    await this.disk.remove(this.journal);
    await this.secure.removeItem(this.session);
  }
  async recover(): Promise<boolean> {
    const journal = await this.disk.get(this.journal);
    if (!journal) { await this.secure.removeItem(this.session); return false; }
    if (journal.version !== 1) throw new Error('localAccountUnavailable');
    const profile = await this.load(journal.from);
    const raw = await this.secure.getItem(this.session);
    if (!profile?.storage || !raw) throw new Error('localAccountUnavailable');
    const session = JSON.parse(raw) as [string, string | null][];
    if (session.length !== this.sessionKeys.length || session.some(([key], i) => key !== this.sessionKeys[i])) throw new Error('localAccountInvalid');
    await this.clearNativeQueue();
    for (const key of this.storageKeys) {
      const entry = profile.storage.find(([name]) => key === name);
      if (!entry) throw new Error('localAccountInvalid');
      if (entry[1] == null) await this.disk.remove(key); else await this.disk.set(key, entry[1]);
    }
    for (const [key, value] of session) {
      if (value == null) await this.secure.removeItem(key); else await this.secure.setItem(key, value);
    }
    await this.commit();
    return true;
  }
  async load(id: unknown): Promise<LocalAccountProfile | null> {
    const name = await this.name(id), saved = await this.disk.get(name);
    if (!saved) return null;
    const raw = await this.secure.getItem(name);
    if (!raw || saved.version !== 1) throw new Error('localAccountUnavailable');
    const key = await crypto.subtle.importKey('raw', this.decode(raw), 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.decode(saved.iv), additionalData: new TextEncoder().encode(name) }, key, this.decode(saved.cipher));
    const profile = JSON.parse(new TextDecoder().decode(plain));
    if (!Array.isArray(profile.notes) || !Array.isArray(profile.folders) || !Array.isArray(profile.outbox)
      || !Array.isArray(profile.pendingDeletes) || typeof profile.foldersPending !== 'boolean') throw new Error('localAccountInvalid');
    return profile;
  }
}
