import { ScreenshotProtectionService } from '../app/services/screenshot-protection.service';
import { LocalNote, copyTrashedNotes, restoreSourceIds, restorationCleanup, RestoreObservation } from './note-restoration';
import '@angular/compiler';
import { firstValueFrom, timeout } from 'rxjs';
import { HttpClient, HttpXhrBackend } from '@angular/common/http';
import { Storage } from '@ionic/storage';
import { openNotesDatabase } from './notes-database';
import { LocalAccountProfiles } from './local-account-profiles';
import { CryptoKeyService } from '../app/services/crypto-key.service';
import { CryptoService } from '../app/services/crypto.service';
import { SecureStorageService } from '../app/services/secure-storage.service';
import { NotesStorageService } from '../app/services/notes-storage.service';
import { NotesService } from '../app/services/notes.service';
import { BackgroundNotesSyncService } from '../app/services/background-notes-sync.service';
import { OutboxStorage } from '../app/services/outbox-storage.service';
import { NotesApiV1Service } from '../app/services/notes-api-v1.service';
import { SyncWorkerService } from '../app/services/sync-worker.service';
import { RealtimeNotesService } from '../app/services/realtime-notes.service';
import { IdentityAuthService } from '../app/services/identity-auth.service';
import { AuthService } from '../app/services/auth.service';
import { SecretapiService } from '../app/services/secretapi.service';
import { Secret } from '../app/models/Secret';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';
import { Preferences } from '@capacitor/preferences';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { resolveFolderReference } from '../app/utils/folder-reference';
import { homeNotePlainText } from '../app/utils/home-note-preview.util';
import { nextNoteVersion } from '../app/utils/note-version';
import { createVault, exportServerBundleFromHeader, extractPlainEAK, unpackCipherBlob } from '@stellarsecurity/stellar-crypto';
import { Injector, runInInjectionContext, ɵ_sanitizeHtml } from '@angular/core';
import type { NgZone } from '@angular/core';
import type { Folder } from '../app/models/Folder';
import type { NoteV1 } from '../app/models/NoteV1';
import type { OutboxOp } from '../app/models/Sync';

const appearance = registerPlugin<{
  appearance(options: { theme: string; overlay: string }): Promise<void>;
  selectionFeedback(): Promise<{ performed: boolean }>;
  errorFeedback(): Promise<{ performed: boolean }>;
  resetLocalApp(): Promise<void>;
  openRecoveryExport(): Promise<{ closed: boolean }>;
  saveImage(options: { dataUrl: string }): Promise<{ saved: boolean }>;
  biometricStatus(): Promise<{ available: boolean; enabled: boolean; status: number }>;
  setBiometricLock(options: { enabled: boolean }): Promise<{ available: boolean; enabled: boolean; cancelled: boolean; status: number }>;
}>('StellarSecurity');
export function nativeSelectionFeedback(): Promise<{ performed: boolean }> | null {
  return Capacitor.getPlatform() === 'android' ? appearance.selectionFeedback() : null;
}
export function nativeErrorFeedback(): Promise<unknown> | null {
  if (Capacitor.getPlatform() === 'android') return appearance.errorFeedback();
  return Capacitor.isNativePlatform() ? Haptics.notification({ type: NotificationType.Error }) : null;
}
export function nativeSaveImage(dataUrl: string): Promise<{ saved: boolean }> | null {
  return Capacitor.getPlatform() === 'android' ? appearance.saveImage({ dataUrl }) : null;
}
export function nativeShareLink(url: string): Promise<{ activityType?: string }> | null {
  return Capacitor.isNativePlatform() ? Share.share({ title: 'Stellar Secret', url }) : null;
}
export async function updateNativeAppearance(theme: 'light' | 'dark', overlay: 'none' | 'modal' | 'popover'): Promise<void> {
  if (Capacitor.isNativePlatform()) await appearance.appearance({ theme, overlay });
}

export function sanitizeEditorHtml(html: string): string {
  return ɵ_sanitizeHtml(document, html).toString();
}

export function createBrowserHttpClient(): HttpClient {
  return runInInjectionContext(Injector.create({ providers: [] }), () =>
    new HttpClient(new HttpXhrBackend({ build: () => new XMLHttpRequest() })));
}

export async function createRuntime(onChange: (snapshot: any) => void, platform: { http?: HttpClient; storage?: Storage; secure?: SecureStorageService; background?: boolean; screenProtection?: Pick<ScreenshotProtectionService, 'isEnabled' | 'setEnabled' | 'applyCurrentSetting'>; appLifecycle?: Pick<typeof App, 'addListener'>; recoveryExport?: () => Promise<unknown> } = {}) {
  const backListener = Capacitor.getPlatform() === 'android' ? await App.addListener('backButton', () => {
    const handleBack = (window as Window & { stellarHandleBack?: () => boolean }).stellarHandleBack;
    if (!handleBack?.()) void App.minimizeApp();
  }) : undefined;
  const screenProtection = platform.screenProtection || new ScreenshotProtectionService();
  const screenshotToggle = !!platform.screenProtection || Capacitor.isNativePlatform();
  const initialScreenProtection = screenshotToggle
    ? screenProtection.applyCurrentSetting().then(() => screenProtection.isEnabled()) : Promise.resolve(true);
  const http = platform.http || createBrowserHttpClient();
  const disk = platform.storage || await openNotesDatabase();
  let initialPreferences: Promise<any[]> | null = Promise.all([disk.get('notes.design.preferences.v1'), disk.get('ssAppearanceMode')]);
  const initialBiometricStatus = biometricStatus().catch(() => ({ available: false, enabled: false, status: -1 }));
  const secure = platform.secure || new SecureStorageService();
  const background = new BackgroundNotesSyncService();
  const profiles = new LocalAccountProfiles(disk, secure, () => background.clearQueueForAccountSwitch());
  await profiles.recover();
  const local = new NotesStorageService(disk);
  await local.init();
  // Recover only the guest profile. Never import old guest data into a signed-in
  // account or one whose keys/session still need account-profile recovery.
  const accountState = await Promise.all(['ssToken', 'ssUser', 'ssIdentitySession', 'ssAuthVersion', 'ssEakB64', 'ssEakB64_Encrypted']
    .map(key => secure.getItem(key)));
  const recoveredLegacy = accountState.every(value => value == null) && await local.recoverLegacyIntoEmptyStore();
  const keys = new CryptoKeyService();
  const legacyCrypto = new CryptoService();
  const secrets = new SecretapiService(http);
  const state = new NotesService(local);
  const outbox = new OutboxStorage(disk, background);
  const api = new NotesApiV1Service(http, secure, keys, outbox, background, state);
  const identity = new IdentityAuthService(http, secure, keys);
  const auth = new AuthService(http, secure, identity);
  const worker = new SyncWorkerService(http, outbox, { run: (fn: () => unknown) => fn() } as NgZone, secure, state);
  const realtime = new RealtimeNotesService(http, auth, secure);
  const notePasswords = new Map<string, string>();
  let records: LocalNote[] = [];
  let conflicts: string[] = [];
  let folderRecords: Folder[] = [];
  let user: any = null;
  let syncing = false;
  let failure = '';
  let serial: Promise<unknown> = Promise.resolve();
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let exportingRecovery = false;
  const pendingDeletes = new Set<string>();
  const dirtyViews = new Set<string>();
  const acknowledgedVersions = new Map<string, number>();
  let editingId: string | null = null;

  const readArray = (raw: string): any[] => {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) throw new Error('notesStorageInvalid');
    return parsed;
  };
  const plainText = homeNotePlainText;
  const stored = () => {
    const raw = state.getNotes();
    return state.appHasPasswordChallenge() ? legacyCrypto.decrypt(raw, state.getNotesAppPassword()) : raw;
  };
  if (!state.appHasPasswordChallenge()) {
    records = readArray(stored());
    folderRecords = readArray(state.getFolders());
  }
  const snapshot = () => {
    const hidden = restoreSourceIds(records);
    return ({
    notes: records.filter(note => !hidden.has(note.id)).map(note => {
      let title = note.title || '', html = note.text || '';
      if (note.protected) {
        const password = notePasswords.get(note.id);
        if (password) {
          title = legacyCrypto.decrypt(title, password);
          html = legacyCrypto.decrypt(html, password);
        } else { title = ''; html = ''; }
      }
      return { id: note.id, title, html, body: plainText(html), folder: note.folder || '',
        pin: !!note.pinned, star: !!note.favorite, locked: !!note.protected, unlocked: notePasswords.has(note.id),
        deleted: !!note.deleted, deletedAt: note.deleted_at, baseVersion: Number(note.base_version || 0), acknowledgedVersion: acknowledgedVersions.get(note.id), modifiedAt: new Date(Number.isFinite(Number(note.last_modified)) && Number(note.last_modified) > 0 && Number(note.last_modified) < 8640000000000000 ? Number(note.last_modified) : Date.now()).toISOString() };
    }),
    folders: folderRecords.filter(folder => !folder.deleted && folder.name.trim()).map(folder => folder.name),
    user: auth.isLoggedIn && user ? { email: user.email, authVersion: user.auth_version } : null,
    loggedIn: auth.isLoggedIn, syncing, failure, conflicts: [...conflicts],
    appLocked: state.appHasPasswordChallenge() && !state.getNotesAppPassword(),
    appLockEnabled: state.appHasPasswordChallenge(),
  });
  };
  const emit = () => { if (!disposed) onChange(snapshot()); };
  const persist = async () => {
    const noteJson = JSON.stringify(records), folderJson = JSON.stringify(folderRecords);
    const locked = state.appHasPasswordChallenge();
    const password = state.getNotesAppPassword();
    // A download with no collection changes must not rewrite the local store
    // or its compatibility mirror (which can still hold a recovery source).
    if (locked || state.getNotes() !== noteJson) state.setNotes(locked ? legacyCrypto.encrypt(noteJson, password) : noteJson);
    if (locked || state.getFolders() !== folderJson) state.setFolders(locked ? legacyCrypto.encrypt(folderJson, password) : folderJson);
    state.setDecryptedNotes(noteJson);
    await state.flushPersistence();
  };
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = serial.then(work);
    serial = result.catch(() => undefined);
    return result;
  };
  const queueSync = () => {
    if (activeSync) { refreshPending = true; return; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { void sync().catch(() => undefined); }, 250);
  };
  async function wipeLocal() {
    auth.clearAuthenticationState();
    await outbox.clear();
    await disk.remove('notes.design.pending-deletes.v1'); await disk.remove('notes.design.folders-pending.v1');
    keys.clearRuntimeKeys(); notePasswords.clear(); pendingDeletes.clear();
    for (const key of ['ssToken','ssUser','ssEakB64','ssEakB64_Encrypted']) await secure.removeItem(key);
    await identity.clearSession();
    records = []; folderRecords = []; user = null;
    state.clearSensitiveRuntimeState();
    state.setAppPasswordChallengeEnabled(false);
    state.clearAppUnlockFailures();
    await persist();
  }
  const uploadNotes = (notes: LocalNote[]) => notes.map(({ sync_pending, restore_sources, ...note }) => note);
  async function queueUnsaved() {
    const queued = await outbox.getAll();
    const updates = records.filter(note => note.sync_pending && !queued.some(op => op.payload.notes?.some(item => item.id === note.id && Number(item.last_modified) === Number(note.last_modified))));
    if (updates.length || await disk.get('notes.design.folders-pending.v1')) {
      await api.upload(0, uploadNotes(updates), undefined, folderRecords, true);
      await disk.remove('notes.design.folders-pending.v1');
    }
    const deletes = [...pendingDeletes].filter(id => !queued.some(op => op.payload.deleted_ids?.includes(id)));
    if (deletes.length) await api.deleteNotes(deletes);
    for (const note of records) note.sync_pending = false;
    await persist();
  }
  let signingIn = false;
  let activeSync: Promise<void> | undefined;
  let refreshPending = false;
  function sync(): Promise<void> {
    if (!activeSync) clearTimeout(syncTimer);
    if (!activeSync) activeSync = performSync().finally(() => {
      activeSync = undefined;
      if (refreshPending) {
        refreshPending = false;
        if (!disposed && auth.isLoggedIn) queueSync();
      }
    });
    return activeSync;
  }
  async function performSync(): Promise<void> {
    if (exportingRecovery || signingIn || syncing || !auth.isLoggedIn || !navigator.onLine || disposed) return;
    syncing = true; failure = ''; emit();
    try {
      await serial;
      const token = await secure.getItem('ssToken'), generation = outbox.generation;
      const currentSession = async () => auth.isLoggedIn && token === await secure.getItem('ssToken') && generation === outbox.generation;
      await exclusive(queueUnsaved);
      await worker.trySync();
      const queuedDeletes = new Set<string>();
      for (const op of await outbox.getAll()) for (const id of op.payload.deleted_ids || []) queuedDeletes.add(id);
      for (const id of pendingDeletes) if (!queuedDeletes.has(id)) { pendingDeletes.delete(id); state.clearPendingMutation(id); }
      await disk.set('notes.design.pending-deletes.v1', [...pendingDeletes]);
      const known: Record<string, number> = {};
      const hiddenRestoreSources = restoreSourceIds(records);
      for (const note of records) if (!state.hasAnyPendingMutation(note.id) && !note.restore_sources?.length && !hiddenRestoreSources.has(note.id)) {
        const folder = note.folder_id ? folderRecords.find(item => item.id === note.folder_id) : null;
        const unresolvedFolder = note.folder_id && (!folder || folder.deleted);
        if (!unresolvedFolder && Number(note.base_version) === Number(note.last_modified)) known[note.id] = Number(note.last_modified);
      }
      const incoming = await api.download(0, 1000, known);
      if (!await currentSession()) return;
      await exclusive(async () => {
        if (!await currentSession()) return;
        const hiddenRestoreSources = restoreSourceIds(records);
        const merged = new Map(records.map(note => [note.id, note]));
        const restorationChecks = new Map<string, RestoreObservation>();
        for (const encrypted of incoming.notes) {
          const localNote = merged.get(encrypted.id);
          if (encrypted.deleted && !encrypted.text) {
            restorationChecks.set(encrypted.id, { version: Number(encrypted.last_modified), deleted: true, matches: false, stub: true });
            if (hiddenRestoreSources.has(encrypted.id)) continue;
            if (!state.hasAnyPendingMutation(encrypted.id) && !dirtyViews.has(encrypted.id) && editingId !== encrypted.id) merged.delete(encrypted.id);
            continue;
          }
          const restoring = !!localNote?.restore_sources?.length || hiddenRestoreSources.has(encrypted.id);
          if (state.getPendingMutation(encrypted.id) && !restoring) continue;
          const text = await keys.decryptText(unpackCipherBlob(encrypted.text), encrypted.id);
          const title = encrypted.title ? await keys.decryptText(unpackCipherBlob(encrypted.title), encrypted.id + '#title') : '';
          const sameContent = localNote && JSON.stringify([localNote.title,localNote.text,localNote.folder_id,!!localNote.protected,!!localNote.favorite,!!localNote.pinned]) === JSON.stringify([title,text,encrypted.folder_id,!!encrypted.protected,!!encrypted.favorite,!!encrypted.pinned]);
          if (restoring) restorationChecks.set(encrypted.id, { version: Number(encrypted.last_modified), deleted: !!encrypted.deleted, stub: false,
            matches: !!localNote && (localNote.title || '') === title && localNote.text === text
              && ['protected', 'favorite', 'pinned', 'deleted', 'auto_wipe'].every(flag => !!(localNote as any)[flag] === !!(encrypted as any)[flag])
              && (hiddenRestoreSources.has(encrypted.id) || (localNote.folder_id ?? null) === (encrypted.folder_id ?? null)) });
          if (state.getPendingMutation(encrypted.id)) continue;
          if (sameContent && Number(encrypted.last_modified) === Number(localNote.last_modified)) {
            localNote.base_version = Number(encrypted.last_modified);
            acknowledgedVersions.set(encrypted.id, Number(encrypted.last_modified));
          }
          if (editingId === encrypted.id || dirtyViews.has(encrypted.id) || (localNote && Number(localNote.last_modified) > Number(encrypted.last_modified))) continue;
          merged.set(encrypted.id, { ...encrypted, text, title, restore_sources: localNote?.restore_sources, deleted_at: encrypted.deleted ? Number(encrypted.deleted_at || encrypted.last_modified) : undefined });
        }
        if (!await currentSession()) return;
        const cleanup = restorationCleanup([...merged.values()], restorationChecks);
        const retiring: Record<string, number> = {};
        for (const note of merged.values()) for (const source of note.restore_sources || []) if (cleanup.completed.has(source.id)) {
          retiring[source.id] = Math.max(retiring[source.id] || 0, source.version);
        }
        for (const id of cleanup.completed) { merged.delete(id); notePasswords.delete(id); state.clearPendingMutation(id); }
        for (const note of merged.values()) if (note.restore_sources) {
          note.restore_sources = note.restore_sources.filter(source => !cleanup.completed.has(source.id));
          if (!note.restore_sources.length) delete note.restore_sources;
        }
        for (const [id, version] of cleanup.retire) retiring[id] = version;
        records = [...merged.values()];
        const localFolders = new Map(folderRecords.map(folder => [folder.id, folder]));
        for (const folder of incoming.folders) {
          const previous = localFolders.get(folder.id);
          if (!previous || Number(folder.last_modified) >= Number(previous.last_modified)) localFolders.set(folder.id, folder);
        }
        folderRecords = [...localFolders.values()];
        for (const note of records) {
          if (!note.folder_id || state.hasAnyPendingMutation(note.id) || dirtyViews.has(note.id)) continue;
          const folder = localFolders.get(note.folder_id);
          if (folder && (!folder.deleted || note.folder)) {
            const reference = resolveFolderReference(note.folder_id, note.folder, [...localFolders.values()]);
            note.folder_id = reference.folder_id; note.folder = reference.folder;
          }
        }
        await persist();
        if (Object.keys(retiring).length) {
          await outbox.discardChosenVersions(retiring);
          const queued = await outbox.getAll();
          for (const [id, version] of cleanup.retire) {
            // A later source edit must conflict instead of losing its content.
            const retirementVersion = version + 1;
            if (queued.some(op => op.payload.notes.some(note => note.id === id && note.deleted
              && note.text === '' && Number(note.last_modified) === retirementVersion))) continue;
            const opId = crypto.randomUUID();
            await outbox.enqueue({ opId, type: 'upload', attempt: 0, nextAt: Date.now(), createdAt: Date.now(),
              payload: { op_id: opId, since: 0, notes: [{ id, text: '', title: '', deleted: true,
                base_version: version, last_modified: retirementVersion, edit_session: crypto.randomUUID() }] } });
            state.markPendingMutation(id, 'update', retirementVersion);
          }
          queueSync();
        }
      });
      const remaining = await outbox.getAll();
      conflicts = [...new Set(remaining.filter(op => op.conflict).reduce<string[]>((ids, op) => ids.concat((op.payload.notes || []).map(note => note.id)), []))];
      if (remaining.length) failure = conflicts.length ? 'syncConflict' : 'syncPending';
    } catch (error) { failure = 'syncFailed'; throw error; }
    finally { syncing = false; emit(); }
  }
  await auth.initializeAuthState();
  const wipeDays = state.getAppWipeAfterDays(), lastUnlock = state.getLastSuccessfulAppUnlockAt();
  if (state.appHasPasswordChallenge() && wipeDays > 0 && lastUnlock > 0 && Date.now() - lastUnlock >= wipeDays * 86400000) {
    if (recoveredLegacy) throw new Error('notesStorageRecoveryExpired');
    await wipeLocal();
  }
  for (const op of await outbox.getAll()) {
    for (const note of op.payload.notes || []) state.markPendingMutation(note.id, 'update', Number(note.last_modified));
    for (const id of op.payload.deleted_ids || []) { state.markPendingMutation(id, 'delete'); pendingDeletes.add(id); }
  }
  for (const id of await disk.get('notes.design.pending-deletes.v1') || []) pendingDeletes.add(id);
  for (const note of records) if (note.sync_pending) state.markPendingMutation(note.id, 'update', Number(note.last_modified));
  const activeRoot = await secure.getItem('ssEakB64');
  if (activeRoot && !snapshot().appLocked) await keys.importEAK(activeRoot);
  else auth.clearAuthenticationState();
  const cachedUser = await secure.getItem('ssUser');
  if (cachedUser) user = JSON.parse(cachedUser);
  const refresh = () => { if (syncing) refreshPending = true; else queueSync(); };
  window.addEventListener('stellar:notes-changed', refresh);
  window.addEventListener('online', refresh);
  // Resume events from the native app and the browser describe the same
  // transition. Fetch once immediately, keeping cached notes on screen.
  let foreground = !document.hidden;
  const foregroundChanged = (active: boolean) => {
    if (disposed) return;
    const resumed = active && !foreground;
    foreground = active;
    if (!resumed) return;
    if (activeSync) refreshPending = true;
    else void sync().catch(() => undefined);
  };
  const visibilityChanged = () => foregroundChanged(!document.hidden);
  document.addEventListener('visibilitychange', visibilityChanged);
  const appStateListener = (Capacitor.isNativePlatform() || platform.appLifecycle)
    ? await (platform.appLifecycle || App).addListener('appStateChange', state => foregroundChanged(state.isActive)) : undefined;
  const poll = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  if (platform.background !== false) realtime.init();
  const retryTimer = platform.background !== false ? setInterval(() => { if (auth.isLoggedIn) void sync().catch(() => undefined); }, 10000) : undefined;

  async function accountProfile() {
    return { notes: records, folders: folderRecords, outbox: await outbox.getAll(),
      pendingDeletes: [...pendingDeletes], foldersPending: !!await disk.get('notes.design.folders-pending.v1') };
  }
  async function saveAccountProfile(owner: any) {
    if (!owner) return;
    await profiles.save(owner.id, await accountProfile());
  }
  async function selectAccountProfile(owner: any, next: any): Promise<{ selected: boolean; operations: OutboxOp[] }> {
    if (owner && String(owner.id) === String(next.id)) return { selected: false, operations: [] };
    const saved = await profiles.load(next.id);
    if (!owner && !saved) return { selected: false, operations: [] };
    const previousIds = new Set([...records.map(note => note.id), ...pendingDeletes]);
    await background.clearQueueForAccountSwitch();
    await outbox.clear();
    previousIds.forEach(id => state.clearPendingMutation(id));
    const guestNotes = !owner ? records : [], guestFolders = !owner ? folderRecords : [];
    records = [...(saved?.notes || []), ...guestNotes.filter(note => !saved?.notes.some(other => other.id === note.id))];
    folderRecords = [...(saved?.folders || []), ...guestFolders.filter(folder => !saved?.folders.some(other => other.id === folder.id))];
    pendingDeletes.clear(); saved?.pendingDeletes.forEach(id => pendingDeletes.add(id));
    dirtyViews.clear(); acknowledgedVersions.clear(); notePasswords.clear(); editingId = null;
    for (const note of records) if (note.sync_pending) state.markPendingMutation(note.id, 'update', Number(note.last_modified));
    for (const op of saved?.outbox || []) {
      for (const note of op.payload.notes || []) state.markPendingMutation(note.id, 'update', Number(note.last_modified));
      for (const id of op.payload.deleted_ids || []) state.markPendingMutation(id, 'delete');
    }
    await disk.set('notes.design.pending-deletes.v1', [...pendingDeletes]);
    if (saved?.foldersPending) await disk.set('notes.design.folders-pending.v1', true);
    else await disk.remove('notes.design.folders-pending.v1');
    return { selected: true, operations: saved?.outbox || [] };
  }
  async function acceptSession(result: any, password: string) {
    if (result.response?.response_code !== 200) throw new Error('loginFailed');
    const response = result.response;
    const previousOwner = user || JSON.parse(await secure.getItem('ssUser') || 'null');
    const root: Uint8Array | null = result.identity?.rootKey || null;
    let transitioning = false;
    try {
      const changingAccount = !!previousOwner && String(previousOwner.id) !== String(response.user.id);
      const returningAccount = !previousOwner && !!await profiles.load(response.user.id);
      if (changingAccount || returningAccount) {
        await profiles.begin(previousOwner?.id || 'guest', await accountProfile());
        transitioning = true;
      }
      auth.clearAuthenticationState();
      const selectedProfile = await selectAccountProfile(previousOwner, response.user);
      if (result.identity) await auth.prepareProtectedSession(result.identity);
      else {
        await auth.rememberLegacySession();
        await secure.setItem('ssToken', response.token);
      }
      if (!root && response.user.eak_b64 == null) {
        const { header } = await createVault(password);
        const bundle = exportServerBundleFromHeader(header);
        await auth.updateEak(bundle);
        Object.assign(response.user, { crypto_version: bundle.crypto_version, kdf_params: bundle.kdf_params, kdf_salt_b64: bundle.kdf_salt, eak_b64: bundle.eak });
      }
      const eak = root ? btoa(String.fromCharCode(...root)) : (await extractPlainEAK(password, {
        crypto_version: response.user.crypto_version, kdf_params: response.user.kdf_params,
        kdf_salt: response.user.kdf_salt_b64, eak: response.user.eak_b64,
      })).eakB64;
      await keys.importEAK(eak);
      user = response.user;
      await secure.setItem('ssUser', JSON.stringify(user));
      if (state.appHasPasswordChallenge()) await secure.setItem('ssEakB64_Encrypted', legacyCrypto.encrypt(eak, state.getNotesAppPassword()));
      else await secure.setItem('ssEakB64', eak);
      await secure.setItem('ssToken', response.token);
      for (const op of selectedProfile.operations) await outbox.enqueue(op);
      await auth.initializeAuthState();
      await persist();
      if (transitioning) { await profiles.commit(); transitioning = false; }
      const guest = !previousOwner && !selectedProfile.selected ? records.filter(note => !note.deleted) : [];
      if (guest.length || (!previousOwner && !selectedProfile.selected && folderRecords.length)) await api.upload(0, uploadNotes(guest), undefined, folderRecords, true);
      void sync().catch(() => undefined);
      return { recoveryCode: identity.pendingRecoveryCode };
    } catch (error) {
      if (transitioning) {
        runtime.dispose();
        await profiles.recover();
        throw new Error('localAccountReloadRequired');
      }
      throw error;
    } finally { root?.fill(0); }
  }

  function biometricStatus() { return Capacitor.isNativePlatform()
    ? appearance.biometricStatus()
    : Promise.resolve({ available: false, enabled: false, status: -1 }); }
  let biometric = await initialBiometricStatus;
  const capabilities = { native: Capacitor.isNativePlatform(), biometric: biometric.available || biometric.enabled, screenshotToggle, recoveryExport: Capacitor.getPlatform() === 'android' || !!platform.recoveryExport };
  let screenshotEnabled = await initialScreenProtection;
  const runtime = {
    snapshot,
    sync,
    async resolveConflicts() {
      await exclusive(async () => {
        const ops = (await outbox.getAll()).filter(op => op.conflict);
        const versions: Record<string, number> = {};
        for (const op of ops) for (const note of op.payload.notes || []) versions[note.id] = Math.max(versions[note.id] || 0, Number(note.last_modified));
        for (const id of Object.keys(versions)) {
          const source = records.find(note => note.id === id);
          if (!source) throw new Error('conflictNoteMissing');
          const copy = { ...source, id: crypto.randomUUID(), base_version: 0, last_modified: nextNoteVersion(records), sync_pending: true };
          records.push(copy);
          if (notePasswords.has(id)) notePasswords.set(copy.id, notePasswords.get(id)!);
          state.markPendingMutation(copy.id, 'update', Number(copy.last_modified));
        }
        await persist();
        await outbox.discardChosenVersions(versions);
        records = records.filter(note => !(note.id in versions));
        for (const id of Object.keys(versions)) { state.clearPendingMutation(id); notePasswords.delete(id); dirtyViews.delete(id); }
        editingId = null; conflicts = [];
        await persist(); await queueUnsaved();
      });
      await sync(); emit();
    },
    setEditing(id: string | null) { editingId = id; },
    markDirty(id: string, dirty = true) { if (dirty) dirtyViews.add(id); else dirtyViews.delete(id); },
    capabilities,
    async openRecoveryExport() {
      if (!capabilities.recoveryExport) throw new Error('recoveryExportUnavailable');
      if (exportingRecovery) throw new Error('recoveryExportPending');
      exportingRecovery = true;
      clearTimeout(syncTimer);
      try {
        // Finish queued writes before the native read-only snapshot. A failed
        // sync must not prevent recovery of the local files that still exist.
        if (activeSync) await activeSync.catch(() => undefined);
        await serial;
        await state.flushPersistence();
        return await (platform.recoveryExport ? platform.recoveryExport() : appearance.openRecoveryExport());
      } finally {
        exportingRecovery = false;
        if (!disposed && auth.isLoggedIn) queueSync();
      }
    },
    async setScreenshotProtection(enabled: boolean) {
      if (!capabilities.screenshotToggle) throw new Error('screenProtectionUnavailable');
      await screenProtection.setEnabled(enabled);
      screenshotEnabled = await screenProtection.isEnabled();
      return { enabled: screenshotEnabled };
    },
    async setBiometricLock(enabled: boolean) {
      if (!Capacitor.isNativePlatform()) throw new Error('biometricUnavailable');
      const result = await appearance.setBiometricLock({ enabled });
      biometric = result;
      capabilities.biometric = result.available || result.enabled;
      return result;
    },
    async signIn(email: string, password: string) {
      if (signingIn) throw new Error('loginPending');
      signingIn = true;
      try {
        await activeSync?.catch(() => undefined);
        await serial;
        return await acceptSession(await auth.signIn(email, password, true), password);
      } finally {
        signingIn = false;
        if (auth.isLoggedIn) queueSync();
      }
    },
    async register(email: string, password: string) { if (password.length < 6) throw new Error('passwordTooShort'); return acceptSession(await auth.createProtectedAccount(email, password), password); },
    async recover(email: string, code: string, password: string) {
      if (password.length < 6) throw new Error('passwordTooShort');
      const session = await identity.recover(email, code, password);
      return acceptSession({ response: identity.sessionResponse(session), identity: session }, password);
    },
    async resetPassword(email: string, code: string, password: string) {
      const response = await firstValueFrom(auth.resetPassword({ email, confirmation_code: code, new_password: password }));
      if (response?.response_code !== 200) throw new Error('passwordResetFailed');
    },
    async forgot(email: string) {
      if (await auth.loginMethod(email) === 'opaque') return { recovery: true };
      const result = await firstValueFrom(auth.forgotPassword(email));
      if (result?.response_code !== 200) throw new Error('passwordResetFailed');
      return { recovery: false };
    },
    async restoreNotes(ids: string[]) {
      const restoredIds = await exclusive(async () => {
        if (snapshot().appLocked) throw new Error('notesLocked');
        let version = nextNoteVersion(records);
        const restored = copyTrashedNotes(records, ids, () => crypto.randomUUID(), () => version++);
        for (const copy of restored.copies) {
          const source = copy.restore_sources![copy.restore_sources!.length - 1].id;
          const reference = resolveFolderReference(copy.folder_id, copy.folder, folderRecords);
          copy.folder_id = reference.folder_id; copy.folder = reference.folder;
          if (notePasswords.has(source)) notePasswords.set(copy.id, notePasswords.get(source)!);
          state.markPendingMutation(copy.id, 'update', Number(copy.last_modified));
        }
        records = [...records, ...restored.copies];
        await persist();
        if (auth.isLoggedIn) { await queueUnsaved(); queueSync(); }
        return restored.restoredIds;
      });
      emit();
      return restoredIds;
    },
    async save(viewNotes: any[], viewFolders: string[], deletedIds: string[] = [], deletedFolderNames: string[] = [], changedIds?: string[]) {
      return exclusive(async () => {
        if (snapshot().appLocked) throw new Error('notesLocked');
        viewFolders = viewFolders.filter(name => name.trim());
        const old = new Map(records.map(note => [note.id, note]));
        const names = new Set(viewFolders);
        if (JSON.stringify(viewFolders) !== JSON.stringify(folderRecords.filter(folder => !folder.deleted && folder.name.trim()).map(folder => folder.name)) || deletedFolderNames.length) await disk.set('notes.design.folders-pending.v1', true);
        for (const folder of folderRecords) if (!folder.deleted && deletedFolderNames.includes(folder.name)) { folder.deleted = true; folder.last_modified = Date.now(); }
        for (const name of viewFolders) if (!folderRecords.some(folder => !folder.deleted && folder.name === name)) folderRecords.push({ id: crypto.randomUUID(), name, last_modified: Date.now(), deleted: false });
        const viewIds = new Set(viewNotes.map(view => String(view.id)));
        const deleted = new Set(deletedIds);
        const next: LocalNote[] = records.filter(note => !viewIds.has(note.id) && !deleted.has(note.id));
        const changed: NoteV1[] = [];
        for (const view of viewNotes) {
          const id = String(view.id), previous = old.get(id);
          if (previous && changedIds && !changedIds.includes(id)) { next.push(previous); continue; }
          const password = notePasswords.get(id);
          const folder = view.folder ? folderRecords.find(item => !item.deleted && item.name === view.folder) : undefined;
          let title = view.title || '', text = view.html ?? view.body ?? '';
          if (view.locked) {
            if (password) { title = legacyCrypto.encrypt(title, password); text = legacyCrypto.encrypt(text, password); }
            else if (previous?.protected) { title = previous.title || ''; text = previous.text; }
            else throw new Error('notePasswordRequired');
          }
          const note: LocalNote = { ...previous, id, base_version: Number(view.baseVersion ?? previous?.base_version ?? 0), title, text, folder: folder ? folder.name : view.folder || '', folder_id: folder?.id || null,
            protected: !!view.locked, favorite: !!view.star, pinned: !!view.pin, deleted: !!view.deleted, deleted_at: view.deletedAt ? new Date(view.deletedAt).getTime() : undefined };
          const comparable = (item: any) => JSON.stringify([item.title,item.text,item.folder,item.folder_id,!!item.protected,!!item.favorite,!!item.pinned,!!item.deleted]);
          if (!previous || comparable(previous) !== comparable(note)) {
            note.last_modified = nextNoteVersion([...records, ...changed]);
            state.markPendingMutation(id, 'update', note.last_modified);
            note.sync_pending = auth.isLoggedIn;
            changed.push(note);
          }
          next.push(note);
        }
        folderRecords = [...viewFolders.map(name => folderRecords.find(folder => !folder.deleted && folder.name === name)!), ...folderRecords.filter(folder => !folder.deleted && !names.has(folder.name)), ...folderRecords.filter(folder => folder.deleted)];
        const removed = records.filter(note => !next.some(item => item.id === note.id));
        for (const note of removed) {
          if (auth.isLoggedIn) { pendingDeletes.add(note.id); state.markPendingMutation(note.id, 'delete'); }
          else state.clearPendingMutation(note.id);
        }
        await disk.set('notes.design.pending-deletes.v1', [...pendingDeletes]);
        records = next;
        await persist();
        for (const view of viewNotes) dirtyViews.delete(String(view.id));
        if (auth.isLoggedIn) {
          await queueUnsaved();
          queueSync();
        }
      });
    },
    async renameFolder(oldName: string, newName: string) {
      const folder = folderRecords.find(item => !item.deleted && item.name === oldName);
      if (folder) { await disk.set('notes.design.folders-pending.v1', true); folder.name = newName; folder.last_modified = Date.now(); }
    },
    async protectNote(id: string, password: string) {
      if (password.length < 6) throw new Error('passwordTooShort');
      notePasswords.set(String(id), password);
    },
    unlockNote(id: string, password: string) {
      const note = records.find(item => item.id === String(id));
      if (!note?.protected) throw new Error('noteNotFound');
      let text: string, title: string;
      try {
        text = legacyCrypto.decrypt(note.text, password);
        title = legacyCrypto.decrypt(note.title || '', password);
        if (!text && !title) throw new Error('wrongPassword');
      } catch { throw new Error('wrongPassword'); }
      notePasswords.set(String(id), password);
      return { text, title };
    },
    lockNote(id: string) { notePasswords.delete(String(id)); },
    async logout() {
      await serial;
      await sync();
      if ((await outbox.getAll()).length || state.hasPendingMutations()) throw new Error('syncPending');
      await saveAccountProfile(user);
      await auth.revokeCurrentIdentity();
      auth.clearAuthenticationState();
      for (const key of ['ssToken','ssUser','ssEakB64','ssEakB64_Encrypted']) await secure.removeItem(key);
      await identity.clearSession();
      keys.clearRuntimeKeys(); notePasswords.clear(); user = null;
      records = []; folderRecords = [];
      await outbox.clear(); pendingDeletes.clear(); await disk.remove('notes.design.pending-deletes.v1'); await disk.remove('notes.design.folders-pending.v1'); await persist(); emit();
    },
    async resetLocalApp() {
      if (Capacitor.getPlatform() === 'android') {
        await appearance.resetLocalApp();
        return;
      }
      this.dispose();
      await activeSync?.catch(() => undefined);
      await serial;
      await wipeLocal();
      await background.clearDownloaded();
      await secure.clear();
      await state.flushPersistence();
      await disk.clear();
      // Keep old preview data from being imported again after the reset.
      await disk.set('notes.design.database-import.v1', { version: 1, state: 'complete' });
      await disk.set('storage_migration_version', '1');
      localStorage.clear();
      await Preferences.clear();
    },
    async setAppLock(password: string | null) {
      if (password !== null && password.length < 6) throw new Error('passwordTooShort');
      const root = await secure.getItem('ssEakB64');
      if (password !== null) {
        state.setNotesAppPassword(password);
        state.setAppPasswordChallengeEnabled(true);
        if (root) { await secure.setItem('ssEakB64_Encrypted', legacyCrypto.encrypt(root, password)); await secure.removeItem('ssEakB64'); }
      } else {
        const wrapped = await secure.getItem('ssEakB64_Encrypted');
        if (wrapped) await secure.setItem('ssEakB64', legacyCrypto.decrypt(wrapped, state.getNotesAppPassword()));
        state.setAppPasswordChallengeEnabled(false);
      }
      state.recordSuccessfulAppUnlock();
      await persist(); emit();
    },
    async lockApp() {
      await serial;
      await persist();
      state.setNotesAppPassword(''); state.setDecryptedNotes(null);
      keys.clearRuntimeKeys(); notePasswords.clear(); records = []; folderRecords = [];
      auth.clearAuthenticationState(); emit();
    },
    async unlockApp(password: string) {
      let parsed: NoteV1[], parsedFolders: Folder[];
      try {
        const decoded = legacyCrypto.decrypt(state.getNotes(), password);
        if (!decoded) throw new Error('wrongPassword');
        parsed = readArray(decoded);
        // The original localStorage app encrypted notes, but had no folders
        // collection. Authenticate against notes first; only the absent/empty
        // legacy collection may bypass folder decryption.
        const folders = state.getFolders();
        parsedFolders = folders === '[]' ? [] : readArray(legacyCrypto.decrypt(folders, password));
        const wrapped = await secure.getItem('ssEakB64_Encrypted');
        if (wrapped) await keys.importEAK(legacyCrypto.decrypt(wrapped, password));
      } catch {
        const attempts = state.getFailedPasswordAppAttempts() + 1;
        state.setFailedPasswordAppAttempts(attempts);
        await state.flushPersistence();
        if (attempts >= 20) await wipeLocal();
        throw new Error('wrongPassword');
      }
      records = parsed; folderRecords = parsedFolders;
      state.setNotesAppPassword(password);
      state.setDecryptedNotes(JSON.stringify(records));
      state.clearAppUnlockFailures(); state.recordSuccessfulAppUnlock();
      await state.flushPersistence(); await auth.initializeAuthState(); emit(); void sync().catch(() => undefined);
    },
    async generateRecovery(password: string) { return identity.generateRecoveryCode(password); },
    async upgradeIdentity(currentPassword: string, newPassword: string, confirm: () => Promise<string>) {
      if (!user || Number(user.auth_version) === 2 || snapshot().appLocked) throw new Error('notesLocked');
      if (newPassword.length < 12 || newPassword === currentPassword) throw new Error('Use a different password with at least 12 characters.');
      const opened = await extractPlainEAK(currentPassword, { crypto_version: user.crypto_version,
        kdf_params: user.kdf_params, kdf_salt: user.kdf_salt_b64, eak: user.eak_b64 });
      await keys.withEak(async root => {
        if (btoa(String.fromCharCode(...root)) !== opened.eakB64) throw new Error('identityVerificationFailed');
      });
      await sync();
      if (!navigator.onLine || syncing || failure || (await outbox.getAll()).length || records.some(note => note.sync_pending)) {
        throw new Error('Finish syncing before upgrading your account.');
      }
      const ownerId = String(user.id);
      const session = await identity.enroll(newPassword, confirm);
      try {
        if (String(user?.id) !== ownerId) throw new Error('identityAccountSwitchRequiresLogout');
        await auth.prepareProtectedSession(session);
        user = identity.sessionResponse(session)['user'];
        await secure.setItem('ssUser', JSON.stringify(user));
        await secure.setItem('ssToken', session.token);
        await auth.initializeAuthState();
        emit();
      } finally { session.rootKey.fill(0); }
      await sync();
      try { return { recoveryCode: await identity.generateRecoveryCode(newPassword) }; }
      catch { return { recoveryCode: null }; }
    },
    async deleteAccount(password: string) {
      if (Number(user?.auth_version) === 2) await identity.deleteAccount(password);
      else await firstValueFrom(auth.deleteAccount(password));
      await outbox.clear(); pendingDeletes.clear(); await disk.remove('notes.design.pending-deletes.v1'); await disk.remove('notes.design.folders-pending.v1'); auth.clearAuthenticationState();
      for (const key of ['ssToken','ssUser','ssEakB64','ssEakB64_Encrypted']) await secure.removeItem(key);
      await identity.clearSession(); keys.clearRuntimeKeys(); notePasswords.clear();
      user = null; records = []; folderRecords = []; await persist(); emit();
    },
    async createSecret(noteId: string) {
      const note = records.find(item => item.id === String(noteId));
      if (!note) throw new Error('noteNotFound');
      if (note.protected && !notePasswords.has(note.id)) throw new Error('notesLocked');
      const body = note.protected ? legacyCrypto.decrypt(note.text, notePasswords.get(note.id)!) : note.text;
      const secretKey = crypto.randomUUID();
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(secretKey)));
      const secret = new Secret();
      secret.id = Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
      secret.expires_at = '0';
      secret.message = legacyCrypto.encrypt(plainText(body), secretKey);
      const result = await firstValueFrom(secrets.create(secret).pipe(timeout(15000)));
      if (!result?.id) throw new Error('secretCreateFailed');
      return { id: String(result.id), url: 'https://stellarsecret.io/' + secretKey };
    },
    async revokeSecret(id: string) { await firstValueFrom(secrets.delete(id).pipe(timeout(15000))); },
    async preferences(value?: any) {
      if (value !== undefined) {
        if ([1, 5, 15, 30, 60, 120].includes(value.autoLock)) state.setAppLockTimeoutMinutes(value.autoLock);
        if (typeof value.privacy === 'boolean') state.setPrivacyModeEnabled(value.privacy);
        if ([0, 30, 60, 120].includes(value.clipboard)) state.setClipboardAutoClearSeconds(value.clipboard);
        if (typeof value.wipe === 'number') state.setAppWipeAfterDays(state.appHasPasswordChallenge() ? value.wipe : 0);
        if (['light', 'dark', 'system'].includes(value.appearance)) await disk.set('ssAppearanceMode', value.appearance);
        await disk.set('notes.design.preferences.v1', value);
        await state.flushPersistence();
      }
      const cached = value === undefined ? initialPreferences : null;
      initialPreferences = null;
      const [savedValue, appearance] = await (cached || Promise.all([disk.get('notes.design.preferences.v1'), disk.get('ssAppearanceMode')]));
      const saved = savedValue || {};
      if (!cached) biometric = await biometricStatus().catch(() => biometric);
      capabilities.biometric = biometric.available || biometric.enabled;
      return { ...saved, screenshot: screenshotEnabled, biometric: biometric.enabled, autoLock: state.getAppLockTimeoutMinutes(), wipe: state.getAppWipeAfterDays(),
        privacy: state.isPrivacyModeEnabled(), clipboard: state.getClipboardAutoClearSeconds(),
        ...(['light', 'dark', 'system'].includes(appearance) ? { appearance } : {}) };
    },
    dispose() { disposed = true; void backListener?.remove(); void appStateListener?.remove(); document.removeEventListener('visibilitychange', visibilityChanged); loginSubscription.unsubscribe(); keys.clearRuntimeKeys(); notePasswords.clear(); records = []; folderRecords = []; user = null; auth.clearAuthenticationState(); clearTimeout(syncTimer); clearInterval(poll); clearInterval(retryTimer); realtime.dispose(); window.removeEventListener('stellar:notes-changed', refresh); window.removeEventListener('online', refresh); },
  };
  const loginSubscription = auth.loginState$.subscribe(() => emit());
  emit();
  if (auth.isLoggedIn) void sync().catch(() => undefined);
  return runtime;
}
