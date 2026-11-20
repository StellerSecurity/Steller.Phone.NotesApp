import { firstValueFrom, of, throwError, Subject } from 'rxjs';
import { createBrowserHttpClient, createRuntime } from './notes-design-runtime';
import { validRealtimeGrant } from '../app/services/realtime-notes.service';
import { CryptoKeyService } from '../app/services/crypto-key.service';
import { packCipherBlob, unpackCipherBlob } from '@stellarsecurity/stellar-crypto';
import { createVault, exportServerBundleFromHeader, extractPlainEAK } from '@stellarsecurity/stellar-crypto';
import { IdentityAuthService } from '../app/services/identity-auth.service';
import { AuthService } from '../app/services/auth.service';
import { LocalAccountProfiles } from './local-account-profiles';

describe('Browser HTTP transport', () => {
  it('creates the default transport outside an Angular application and performs XHR', async () => {
    const http = createBrowserHttpClient();
    try {
      await firstValueFrom(http.get(location.origin + '/__stellar_http_transport_probe__'));
      fail('Expected the local test server to return 404');
    } catch (error: any) {
      expect(error.status).toBe(404);
    }
  });
});

describe('Original design with existing Notes services', () => {
  const root = btoa('x'.repeat(32));
  let storage: Map<string, any>;
  let secure: Map<string, string>;
  let remote: Map<string, any>;
  let remoteFolders: any[];
  let http: any;
  let runtime: any;
  let disk: any;
  let snapshots: any[];
  let sockets: any[];
  let nativeWebSocket: typeof WebSocket;
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(condition: () => boolean) {
    for (let i = 0; i < 100; i++) { if (condition()) return; await sleep(10); }
    throw new Error('Expected service update did not arrive');
  }
  const note = (title = 'Private title', html = '<p>Private content</p>') => ({ id: '5b56bdf6-bf29-4306-bf2f-d6f69bd9f7ae', title, html, body: 'Private content', folder: '', pin: false, star: false, locked: false });
  async function start(background = false) {
    runtime = await createRuntime(value => snapshots.push(value), { http, storage: disk, background,
      secure: { getItem: async (key: string) => secure.get(key) || null,
        setItem: async (key: string, value: string) => { secure.set(key, value); }, removeItem: async (key: string) => { secure.delete(key); }, clear: async () => { secure.clear(); } } as any });
  }
  beforeEach(() => {
    storage = new Map(); secure = new Map(); remote = new Map(); remoteFolders = []; snapshots = []; sockets = [];
    for (const key of ['notes','folders','app_password_challenge']) localStorage.removeItem(key);
    disk = { create: async () => disk, get: async (key: string) => structuredClone(storage.get(key) ?? null),
      set: async (key: string, value: any) => { storage.set(key, structuredClone(value)); }, remove: async (key: string) => { storage.delete(key); }, clear: async () => { storage.clear(); } };
    http = { post: jasmine.createSpy('post').and.callFake((url: string, body: any) => {
      if (url.endsWith('/realtime')) {
        const grant = { enabled: true, expires_at: Date.now() + 60000, url: 'wss://stellar-notes-realtime-prod.webpubsub.azure.com/client/hubs/notes?access_token=synthetic-grant' };
        expect(validRealtimeGrant(grant)).toBeTrue(); return of(grant);
      }
      if (url.endsWith('/upload')) {
        for (const item of body.notes) {
          const existing = remote.get(item.id);
          if (existing?.deleted && !item.deleted) return throwError(() => ({ status: 409 }));
          if (existing && Number(item.last_modified) < Number(existing.last_modified)) return throwError(() => ({ status: 409 }));
          if (existing && existing.edit_session !== item.edit_session && item.base_version !== existing.last_modified) return throwError(() => ({ status: 409 }));
        }
        for (const item of body.notes) { const { deleted_at, ...stored } = item; remote.set(item.id, stored); }
        return of({ note_ack_v1: true });
      }
      if (url.endsWith('/sync-plan')) { for (const id of body.deleted_ids || []) remote.set(id, { id, text: '', title: '', deleted: true, last_modified: Date.now() }); return of({}); }
      if (url.endsWith('/download')) return of({ notes: [...remote.values()].filter(note => note.deleted || body.known_notes?.[note.id] !== note.last_modified), folders: remoteFolders });
      throw new Error('Unexpected HTTP request: ' + url);
    }) };
  });
  afterEach(() => { runtime?.dispose(); if (nativeWebSocket) window.WebSocket = nativeWebSocket; });
  function signedIn() {
    secure.set('ssToken', 'a'.repeat(40)); secure.set('ssEakB64', root); secure.set('ssAuthVersion', '1');
    secure.set('ssUser', JSON.stringify({ id: '123', email: 'runtime@example.invalid', auth_version: 1 }));
  }
  it('does not expose a cached account when its session is missing', async () => {
    secure.set('ssUser', JSON.stringify({ id: '123', email: 'stale@example.invalid', auth_version: 1 }));
    await start();
    expect(runtime.snapshot().loggedIn).toBeFalse();
    expect(runtime.snapshot().user).toBeNull();
  });
  it('keeps the active account available to settings', async () => {
    signedIn();
    await start();
    expect(runtime.snapshot().loggedIn).toBeTrue();
    expect(runtime.snapshot().user.email).toBe('runtime@example.invalid');
  });
  it('keeps V1 note data and keys unchanged by an unverified biometric preference', async () => {
    signedIn();
    await start();
    await runtime.save([note()], ['Personal']);
    const beforeNotes = storage.get('notes'), beforeFolders = storage.get('folders');
    const beforeKey = secure.get('ssEakB64');
    expect((await runtime.preferences({ biometric: true })).biometric).toBeFalse();
    await expectAsync(runtime.setBiometricLock(true)).toBeRejectedWithError('biometricUnavailable');
    expect(storage.get('notes')).toBe(beforeNotes);
    expect(storage.get('folders')).toBe(beforeFolders);
    expect(secure.get('ssEakB64')).toBe(beforeKey);
    expect(runtime.snapshot().loggedIn).toBeTrue();
    expect(runtime.snapshot().appLocked).toBeFalse();
  });
  async function legacyMigrationAccount() {
    signedIn();
    const { header } = await createVault('old-runtime-password');
    const bundle = exportServerBundleFromHeader(header);
    const { eakB64 } = await extractPlainEAK('old-runtime-password', bundle);
    secure.set('ssEakB64', eakB64);
    secure.set('ssUser', JSON.stringify({ id: '123', email: 'runtime@example.invalid', auth_version: 1,
      crypto_version: bundle.crypto_version, kdf_params: bundle.kdf_params,
      kdf_salt_b64: bundle.kdf_salt, eak_b64: bundle.eak }));
    await start();
    return eakB64;
  }
  const retainedNotes = () => JSON.parse(storage.get('notes')).map(({ sync_pending, ...note }: any) => note);
  it('migrates the identity session without changing note content, folders or their encryption key', async () => {
    const originalKey = await legacyMigrationAccount();
    await runtime.save([note()], ['Personal']); await runtime.sync();
    const savedNotes = retainedNotes(), savedFolders = storage.get('folders');
    const rootKey = Uint8Array.from(atob(originalKey), character => character.charCodeAt(0));
    spyOn(IdentityAuthService.prototype, 'enroll').and.callFake(async (_password, confirm) => {
      expect(await confirm()).toBe('12345678');
      return { accountId: '123', email: 'runtime@example.invalid', token: '2|' + 'b'.repeat(40),
        expiresAt: new Date(Date.now() + 60000).toISOString(), keyEnvelope: btoa('e'.repeat(60)), rootKey };
    });
    spyOn(IdentityAuthService.prototype, 'generateRecoveryCode').and.resolveTo('SYNTHETIC-RECOVERY');
    const result = await runtime.upgradeIdentity('old-runtime-password', 'new-runtime-password', async () => '12345678');
    expect(result.recoveryCode).toBe('SYNTHETIC-RECOVERY');
    expect(secure.get('ssEakB64')).toBe(originalKey);
    expect(secure.get('ssAuthVersion')).toBe('2');
    expect(retainedNotes()).toEqual(savedNotes); expect(storage.get('folders')).toBe(savedFolders);
    expect(rootKey.every(byte => byte === 0)).toBeTrue();
  });
  it('cancelling migration preserves the legacy session and original notes', async () => {
    const originalKey = await legacyMigrationAccount();
    await runtime.save([note()], []); await runtime.sync();
    const savedNotes = retainedNotes();
    spyOn(IdentityAuthService.prototype, 'enroll').and.rejectWith(new Error('migrationCancelled'));
    await expectAsync(runtime.upgradeIdentity('old-runtime-password', 'new-runtime-password', async () => '')).toBeRejected();
    expect(secure.get('ssToken')).toBe('a'.repeat(40)); expect(secure.get('ssAuthVersion')).toBe('1');
    expect(secure.get('ssEakB64')).toBe(originalKey); expect(retainedNotes()).toEqual(savedNotes);
  });
  it('an offline migration cannot discard or bypass pending local edits', async () => {
    await legacyMigrationAccount();
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    await runtime.save([note()], []);
    const enroll = spyOn(IdentityAuthService.prototype, 'enroll');
    await expectAsync(runtime.upgradeIdentity('old-runtime-password', 'new-runtime-password', async () => '12345678')).toBeRejected();
    expect(enroll).not.toHaveBeenCalled(); expect(runtime.snapshot().notes[0].title).toBe('Private title');
    expect(secure.get('ssAuthVersion')).toBe('1');
  });
  it('repairs cached encrypted folder labels when known notes are omitted from download', async () => {
    signedIn();
    const keys = new CryptoKeyService(); await keys.importEAK(root);
    const folderId = crypto.randomUUID();
    const cipher = packCipherBlob(await keys.encryptText('Privat mappe', folderId + '#folder-name'));
    const id = note().id;
    remote.set(id, { id, title: packCipherBlob(await keys.encryptText('Cached title', id + '#title')), text: packCipherBlob(await keys.encryptText('<p>Cached content</p>', id)), folder_id: folderId, folder: cipher, last_modified: 17 });
    remoteFolders = [{ id: folderId, name: cipher, last_modified: 17 }];
    await disk.set('notes', JSON.stringify([{ id, title: 'Cached title', text: '<p>Cached content</p>', folder_id: folderId, folder: cipher, last_modified: 17, base_version: 17 }]));
    await disk.set('folders', JSON.stringify(remoteFolders));
    await start(); await runtime.sync();
    expect(runtime.snapshot().notes[0].folder).toBe('Privat mappe');
    expect(runtime.snapshot().folders).toEqual(['Privat mappe']);
    expect(runtime.snapshot().notes[0].html).toBe('<p>Cached content</p>');
    const downloads = http.post.calls.allArgs().filter((args: any[]) => args[0].endsWith('/download'));
    expect(downloads[0][1].known_notes[id]).toBe(17);
    expect(http.post.calls.allArgs().some((args: any[]) => args[0].endsWith('/upload'))).toBeFalse();
    expect(JSON.parse(storage.get('notes'))[0].folder).toBe('Privat mappe');
  });
  it('persists real guest notes without making account or sync requests', async () => {
    await start(); await runtime.save([note()], ['Personal']);
    expect(JSON.parse(storage.get('notes'))[0].title).toBe('Private title');
    expect(runtime.snapshot().notes.length).toBe(1);
    expect(http.post).not.toHaveBeenCalled();
    runtime.dispose(); await start();
    expect(runtime.snapshot().notes[0].html).toBe('<p>Private content</p>');
  });
  it('finishes login after durable local writes while a network download is still pending', async () => {
    await start(); await runtime.save([note()], []);
    const download = new Subject<any>();
    http.post.and.callFake((url: string) => {
      if (url.endsWith('/download')) return download;
      if (url.endsWith('/upload')) return of({ note_ack_v1: true });
      throw new Error('Unexpected login sync request');
    });
    const rootKey = Uint8Array.from(atob(root), value => value.charCodeAt(0));
    const session = { accountId: '123', email: 'runtime@example.invalid', token: '2|' + 'b'.repeat(40),
      expiresAt: new Date(Date.now() + 60000).toISOString(), keyEnvelope: btoa('e'.repeat(60)), rootKey };
    spyOn(AuthService.prototype, 'signIn').and.resolveTo({ identity: session,
      response: { response_code: 200, token: session.token, user: { id: '123', email: session.email, auth_version: 2 } } });
    try {
      const completed = await Promise.race([runtime.signIn(session.email, 'synthetic-password').then(() => true), sleep(1000).then(() => false)]);
      expect(completed).toBeTrue();
      expect(secure.get('ssAuthVersion')).toBe('2');
      expect(JSON.parse(storage.get('notes'))[0].title).toBe('Private title');
      expect(runtime.snapshot().loggedIn).toBeTrue();
    } finally { download.next({ notes: [], folders: [] }); download.complete(); }
  });
  it('keeps offline uploads durable across runtime recreation', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    signedIn(); await start(); await runtime.save([note()], []);
    expect(storage.get('notes.sync.outbox.v1').length).toBe(1);
    expect(http.post).not.toHaveBeenCalled();
    runtime.dispose(); await start();
    expect(storage.get('notes.sync.outbox.v1').length).toBe(1);
    expect(runtime.snapshot().notes[0].title).toBe('Private title');
  });
  it('uses the existing encrypted upload format and only clears acknowledged work', async () => {
    signedIn(); await start(); await runtime.save([note()], []); await runtime.sync();
    const call = http.post.calls.allArgs().find((args: any[]) => args[0].endsWith('/upload'));
    expect(call).toBeDefined();
    const uploaded = call[1].notes[0];
    expect(JSON.stringify(uploaded)).not.toContain('Private content');
    expect(JSON.stringify(uploaded)).not.toContain('Private title');
    const crypto = new CryptoKeyService(); await crypto.importEAK(root);
    expect(await crypto.decryptText(unpackCipherBlob(uploaded.text), uploaded.id)).toBe('<p>Private content</p>');
    expect(storage.get('notes.sync.outbox.v1').length).toBe(0);
  });
  it('preserves notes and folders absent from a stale view unless explicitly deleted', async () => {
    await start(); const first = note();
    const second = { ...note('Second'), id: crypto.randomUUID() };
    await runtime.save([first, second], ['First', 'Second']);
    await runtime.save([first], ['First']);
    expect(runtime.snapshot().notes.length).toBe(2);
    expect(runtime.snapshot().folders).toContain('Second');
    await runtime.save([first], ['First'], [second.id], ['Second']);
    expect(runtime.snapshot().notes.length).toBe(1);
    expect(runtime.snapshot().folders).not.toContain('Second');
  });
  it('does not replace another note with an unchanged stale editor snapshot', async () => {
    await start(); const first = note();
    const second = { ...note('Second'), id: crypto.randomUUID() };
    await runtime.save([first, second], []);
    await runtime.save([first, { ...second, title: 'Latest remote content' }], []);
    await runtime.save([{ ...first, title: 'My edit' }, second], [], [], [], [first.id]);
    expect(runtime.snapshot().notes.find((item: any) => item.id === second.id).title).toBe('Latest remote content');
  });
  it('advances an acknowledged edit version while keeping the editor open', async () => {
    signedIn(); await start(); const view = note();
    runtime.setEditing(view.id);
    await runtime.save([view], []); await runtime.sync();
    const saved = runtime.snapshot().notes[0];
    expect(saved.baseVersion).toBeGreaterThan(0);
    expect(saved.acknowledgedVersion).toBe(saved.baseVersion);
    runtime.dispose(); await start();
    expect(runtime.snapshot().notes[0].baseVersion).toBe(saved.baseVersion);
  });
  it('edits successfully after reload with the real known-notes and causal-version rules', async () => {
    signedIn(); await start(); await runtime.save([note()], []); await runtime.sync();
    runtime.dispose(); await start();
    const view = runtime.snapshot().notes[0];
    await runtime.save([{ ...view, title: 'After reload' }], []); await runtime.sync();
    expect(runtime.snapshot().conflicts).toEqual([]);
    expect(storage.get('notes.sync.outbox.v1')).toEqual([]);
    const crypto = new CryptoKeyService(); await crypto.importEAK(root);
    expect(await crypto.decryptText(unpackCipherBlob(remote.get(view.id).title), view.id + '#title')).toBe('After reload');
  });
  it('follows a notification received during a download with another download', async () => {
    signedIn(); await start();
    const blocked = new Subject<any>(); let downloads = 0;
    http.post.and.callFake((url: string) => {
      if (url.endsWith('/download') && ++downloads === 1) return blocked;
      return of({ notes: [], folders: [] });
    });
    const first = runtime.sync();
    await waitFor(() => downloads === 1);
    window.dispatchEvent(new Event('stellar:notes-changed'));
    blocked.next({ notes: [], folders: [] }); blocked.complete(); await first;
    await waitFor(() => downloads === 2);
    expect(downloads).toBe(2);
  });

  it('accepts remote updates again when an unpersisted edit is cancelled', async () => {
    signedIn(); await start(); await runtime.save([note()], []); await runtime.sync();
    const view = runtime.snapshot().notes[0];
    const keys = new CryptoKeyService(); await keys.importEAK(root);
    remote.set(view.id, { ...remote.get(view.id), text: packCipherBlob(await keys.encryptText('<p>From desktop</p>', view.id)), last_modified: Date.now() + 1000 });
    runtime.markDirty(view.id); await runtime.sync();
    expect(runtime.snapshot().notes[0].html).toBe(view.html);
    runtime.markDirty(view.id, false); await runtime.sync();
    expect(runtime.snapshot().notes[0].html).toBe('<p>From desktop</p>');
  });

  it('recovers an unqueued edit after a failed outbox write and restart', async () => {
    const online = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    signedIn(); await start(); const view = note();
    const set = disk.set;
    disk.set = async (key: string, value: any) => { if (key === 'notes.sync.outbox.v1') throw new Error('disk full'); return set(key, value); };
    await expectAsync(runtime.save([view], [], [], [], [view.id])).toBeRejected();
    disk.set = set;
    runtime.dispose(); await start(); online.and.returnValue(true); await runtime.sync();
    expect(remote.size).toBe(1);
    expect(runtime.snapshot().notes[0].title).toBe(view.title);
    expect(storage.get('notes.sync.outbox.v1')).toEqual([]);
  });
  it('downloads recoverable trash on a clean device and restores its contents', async () => {
    signedIn(); await start(); const view = { ...note(), deleted: true, deletedAt: new Date().toISOString() };
    await runtime.save([view], []); await runtime.sync();
    runtime.dispose(); storage.clear(); localStorage.removeItem('notes'); localStorage.removeItem('folders');
    await start(); await runtime.sync();
    expect(runtime.snapshot().notes[0].deleted).toBeTrue();
    expect(runtime.snapshot().notes[0].html).toBe(view.html);
    expect(Number(runtime.snapshot().notes[0].deletedAt)).toBeGreaterThan(0);
    const [restoredId] = await runtime.restoreNotes([view.id]);
    expect(restoredId).not.toBe(view.id);
    await runtime.sync(); await runtime.sync();
    expect(remote.get(view.id).deleted).toBeTrue();
    expect(remote.get(restoredId).deleted).toBeFalse();
    expect(runtime.snapshot().notes.find((n: any) => n.id === restoredId).html).toBe(view.html);
    expect(runtime.snapshot().notes.some((n: any) => n.id === view.id)).toBeFalse();
  });
  it('keeps both durable copies across restart while the restore upload fails', async () => {
    signedIn(); await start();
    await runtime.save([{ ...note('Restore', '<p><br></p><p>Keep  æøå</p><p><br></p>'), deleted: true }], []); await runtime.sync();
    const id = runtime.snapshot().notes[0].id, original = remote.get(id);
    const post = http.post;
    http.post = (url: string, body: any, options: any) => url.endsWith('/upload') ? throwError(() => ({ status: 503 })) : post(url, body, options);
    const [restoredId] = await runtime.restoreNotes([id]);
    await runtime.sync();
    expect(remote.get(id).text).toBe(original.text);
    expect(JSON.parse(storage.get('notes')).some((n: any) => n.id === id && n.text)).toBeTrue();
    runtime.dispose(); await start();
    expect(runtime.snapshot().notes.map((n: any) => n.id)).toEqual([restoredId]);
    http.post = post;
    await disk.set('notes.sync.outbox.v1', storage.get('notes.sync.outbox.v1').map((op: any) => ({ ...op, nextAt: 0 })));
    await runtime.sync(); await runtime.sync();
    expect(remote.get(restoredId).deleted).toBeFalse();
    expect(remote.get(id).text).toBe('');
    expect(runtime.snapshot().notes[0].html).toBe('<p><br></p><p>Keep  æøå</p><p><br></p>');
    expect(storage.get('notes.sync.outbox.v1')).toEqual([]);
  });
  it('does not finalize the original when the published copy differs despite an upload acknowledgment', async () => {
    signedIn(); await start();
    await runtime.save([{ ...note(), deleted: true }], []); await runtime.sync();
    const originalId = runtime.snapshot().notes[0].id, originalCipher = remote.get(originalId).text;
    const [copy] = await runtime.restoreNotes([originalId]);
    const crypto = new CryptoKeyService(); await crypto.importEAK(root);
    const different = packCipherBlob(await crypto.encryptText('<p>Other content</p>', copy));
    const post = http.post;
    http.post = (url: string, body: any, options: any) => {
      const response = post(url, body, options);
      if (url.endsWith('/upload') && body.notes.some((n: any) => n.id === copy)) remote.get(copy).text = different;
      return response;
    };
    await runtime.sync();
    expect(remote.get(originalId).text).toBe(originalCipher);
    expect(JSON.parse(storage.get('notes')).some((n: any) => n.id === originalId && n.text)).toBeTrue();
  });
  it('does not clear newer trash written between verification and source retirement', async () => {
    signedIn(); await start(); await runtime.save([{ ...note(), deleted: true }], []); await runtime.sync();
    const id = runtime.snapshot().notes[0].id;
    const crypto = new CryptoKeyService(); await crypto.importEAK(root);
    const otherContent = packCipherBlob(await crypto.encryptText('<p>Concurrent trash content</p>', id));
    const post = http.post;
    http.post = (url: string, body: any, options: any) => {
      if (url.endsWith('/upload') && body.notes.some((n: any) => n.id === id && n.deleted && n.text === '')) {
        const original = remote.get(id); remote.set(id, { ...original, text: otherContent, last_modified: original.last_modified + 10 });
      }
      return post(url, body, options);
    };
    const [copy] = await runtime.restoreNotes([id]); await runtime.sync(); await runtime.sync();
    expect(remote.get(id).text).toBe(otherContent);
    expect(runtime.snapshot().notes.find((n: any) => n.id === copy).html).toBe(note().html);
    const retirement = storage.get('notes.sync.outbox.v1').find((op: any) => op.payload.notes.some((n: any) => n.id === id && n.text === ''));
    expect(retirement.conflict).toBeTrue();
  });
  it('restores a locked note without its note password and keeps its inner ciphertext unchanged', async () => {
    signedIn(); await start(); await runtime.save([note()], []);
    const id = runtime.snapshot().notes[0].id;
    await runtime.protectNote(id, 'restore-note-code');
    await runtime.save([{ ...runtime.snapshot().notes[0], locked: true }], []);
    await runtime.save([{ ...runtime.snapshot().notes[0], deleted: true }], []); await runtime.sync();
    const encrypted = JSON.parse(storage.get('notes')).find((n: any) => n.id === id);
    runtime.dispose(); await start();
    expect(runtime.snapshot().notes[0].unlocked).toBeFalse();
    const [copy] = await runtime.restoreNotes([id]);
    const raw = JSON.parse(storage.get('notes')).find((n: any) => n.id === copy);
    expect(raw.text).toBe(encrypted.text); expect(raw.title).toBe(encrypted.title);
    await runtime.sync(); await runtime.sync();
    await runtime.unlockNote(copy, 'restore-note-code');
    expect(runtime.snapshot().notes.find((n: any) => n.id === copy).html).toBe(note().html);
  });
  it('restores a batch without duplicate copies and strips local recovery links from the wire', async () => {
    signedIn(); await start(); const first = note(), second = { ...note('Second'), id: 'second-note-restore-uuid' };
    await runtime.save([{ ...first, deleted: true },{ ...second, deleted: true }], []); await runtime.sync();
    const ids = await runtime.restoreNotes([first.id, first.id, second.id]);
    const again = await runtime.restoreNotes([first.id, second.id]);
    expect(again).toEqual(ids); expect(ids.length).toBe(2);
    await runtime.sync(); await runtime.sync();
    expect(runtime.snapshot().notes.filter((n: any) => !n.deleted).length).toBe(2);
    expect([...remote.values()].some((n: any) => n.restore_sources)).toBeFalse();
  });
  it('removes a permanent tombstone while retaining recoverable encrypted trash', async () => {
    signedIn(); await start();
    await runtime.save([{ ...note(), deleted: true, deletedAt: new Date().toISOString() }], []); await runtime.sync();
    const id = runtime.snapshot().notes[0].id;
    remote.set(id, { id, text: '', title: '', deleted: true, last_modified: Date.now() });
    await runtime.sync();
    expect(runtime.snapshot().notes).toEqual([]);
  });
  it('keeps local and server versions when resolving a parked conflict', async () => {
    signedIn(); await start(); await runtime.save([note()], []); await runtime.sync();
    const original = runtime.snapshot().notes[0];
    const online = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    await runtime.save([{ ...original, title: 'Local conflicting edit' }], []);
    const queued = storage.get('notes.sync.outbox.v1'); queued[0].conflict = true;
    await disk.set('notes.sync.outbox.v1', queued);
    online.and.returnValue(true); await runtime.sync();
    expect(runtime.snapshot().conflicts).toContain(original.id);
    await runtime.resolveConflicts();
    const result = runtime.snapshot();
    expect(result.conflicts).toEqual([]);
    expect(result.notes.length).toBe(2);
    expect(result.notes.find((item: any) => item.id === original.id).title).toBe('Private title');
    expect(result.notes.some((item: any) => item.id !== original.id && item.title === 'Local conflicting edit')).toBeTrue();
  });
  it('preserves both decrypted drafts after a real stale-upload rejection and restart', async () => {
    signedIn(); await start(); await runtime.save([note()], []); await runtime.sync();
    const original = runtime.snapshot().notes[0];
    const keys = new CryptoKeyService(); await keys.importEAK(root);
    const server = { ...remote.get(original.id),
      title: packCipherBlob(await keys.encryptText('Desktop draft', original.id + '#title')),
      text: packCipherBlob(await keys.encryptText('<p>Desktop content</p>', original.id)),
      last_modified: original.baseVersion + 500, edit_session: 'desktop-other-session-111' };
    remote.set(original.id, server);
    await runtime.save([{ ...original, title: 'Mobile draft', html: '<p>Mobile content</p>' }], []);
    await runtime.sync();
    expect(runtime.snapshot().conflicts).toContain(original.id);
    expect(remote.get(original.id).text).toBe(server.text);
    await runtime.resolveConflicts();
    expect(runtime.snapshot().conflicts).toEqual([]);
    const result = runtime.snapshot().notes;
    expect(result.length).toBe(2);
    expect(result.find((item: any) => item.id === original.id).title).toBe('Desktop draft');
    const copy = result.find((item: any) => item.id !== original.id);
    expect(copy.title).toBe('Mobile draft');
    expect(copy.html).toContain('Mobile content');
    expect(await keys.decryptText(unpackCipherBlob(remote.get(copy.id).text), copy.id)).toBe('<p>Mobile content</p>');
    runtime.dispose(); await start();
    expect(runtime.snapshot().notes.map((item: any) => item.title).sort()).toEqual(['Desktop draft', 'Mobile draft']);
  });
  it('uses real password encryption for note locks', async () => {
    await start(); const view = note(); await runtime.save([view], []);
    await runtime.protectNote(view.id, 'six-six'); await runtime.save([{ ...view, locked: true }], []);
    runtime.lockNote(view.id);
    expect(runtime.snapshot().notes[0].html).toBe('');
    expect(storage.get('notes')).not.toContain('Private content');
    expect(() => runtime.unlockNote(view.id, 'wrong-password')).toThrow();
    expect(runtime.unlockNote(view.id, 'six-six').text).toBe('<p>Private content</p>');
  });
  it('does not unlock the app with an incorrect password after reload', async () => {
    await start(); await runtime.save([note()], []); await runtime.setAppLock('six-six');
    expect(storage.get('notes')).not.toContain('Private content');
    await runtime.lockApp(); runtime.dispose(); await start();
    expect(runtime.snapshot().appLocked).toBeTrue();
    await expectAsync(runtime.unlockApp('wrong-password')).toBeRejected();
    expect(runtime.snapshot().appLocked).toBeTrue();
    await runtime.unlockApp('six-six');
    expect(runtime.snapshot().notes[0].title).toBe('Private title');
  });
  it('resets locked local data without deleting synced notes from the server', async () => {
    signedIn(); await start(); await runtime.save([note()], ['Personal']);
    await runtime.sync();
    expect(remote.size).toBe(1);
    await runtime.setAppLock('six-six'); await runtime.lockApp();
    storage.set('notes.design.preferences.v1', { haptics: false });
    localStorage.setItem('notes', 'old-local-copy');
    const requests = http.post.calls.count();
    await runtime.resetLocalApp();
    expect(secure.size).toBe(0);
    expect(storage.has('notes')).toBeFalse();
    expect(storage.has('notes.design.preferences.v1')).toBeFalse();
    expect(storage.get('notes.design.database-import.v1').state).toBe('complete');
    expect(localStorage.getItem('notes')).toBeNull();
    expect(remote.size).toBe(1);
    expect(http.post.calls.count()).toBe(requests);
    await start();
    expect(runtime.snapshot().notes.length).toBe(0);
    expect(runtime.snapshot().appLocked).toBeFalse();
    expect(runtime.snapshot().loggedIn).toBeFalse();
  });
  function loginResult(id: string, email: string) {
    const session = { accountId: id, email, token: '2|' + id.padEnd(40, 'b'),
      expiresAt: new Date(Date.now() + 60000).toISOString(), keyEnvelope: btoa('e'.repeat(60)),
      rootKey: Uint8Array.from(atob(root), value => value.charCodeAt(0)) };
    return { identity: session, response: { response_code: 200, token: session.token, user: { id, email, auth_version: 2 } } };
  }
  it('switches stale signed-out accounts without uploading their local notes to the new account', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    signedIn(); await start(); await runtime.save([note('Account A unsynced')], ['A folder']);
    secure.delete('ssToken'); runtime.dispose(); await start();
    const oldOutbox = structuredClone(storage.get('notes.sync.outbox.v1'));
    const login = spyOn(AuthService.prototype, 'signIn').and.callFake(async email => email.startsWith('other')
      ? loginResult('456', email) : loginResult('123', email));
    await runtime.signIn('other@example.invalid', 'synthetic-password');
    expect(login).toHaveBeenCalledWith('other@example.invalid', 'synthetic-password', true);
    expect(runtime.snapshot().notes.length).toBe(0);
    expect(runtime.snapshot().folders.length).toBe(0);
    expect(http.post).not.toHaveBeenCalled();
    await runtime.save([{ ...note('Account B unsynced'), id: '8b6a4816-d6bc-4684-8f68-04c50391b0a5' }], ['B folder']);
    await runtime.signIn('runtime@example.invalid', 'synthetic-password');
    expect(runtime.snapshot().notes.map((n: any) => n.title)).toEqual(['Account A unsynced']);
    expect(runtime.snapshot().folders).toEqual(['A folder']);
    expect(JSON.stringify(storage.get('notes.sync.outbox.v1'))).toBe(JSON.stringify(oldOutbox));
    await runtime.signIn('other@example.invalid', 'synthetic-password');
    expect(runtime.snapshot().notes.map((n: any) => n.title)).toEqual(['Account B unsynced']);
    expect(runtime.snapshot().folders).toEqual(['B folder']);
    expect(http.post).not.toHaveBeenCalled();
    runtime.dispose(); await start();
    expect(runtime.snapshot().notes.map((n: any) => n.title)).toEqual(['Account B unsynced']);
  });
  it('invalid credentials preserve the original account and local edits', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    signedIn(); await start(); await runtime.save([note('Keep my local note')], []);
    const before = storage.get('notes'), token = secure.get('ssToken');
    spyOn(AuthService.prototype, 'signIn').and.resolveTo({ response: { response_code: 401 } });
    await expectAsync(runtime.signIn('other@example.invalid', 'synthetic-wrong')).toBeRejectedWithError('loginFailed');
    expect(storage.get('notes')).toBe(before); expect(secure.get('ssToken')).toBe(token);
    expect(runtime.snapshot().notes[0].title).toBe('Keep my local note');
  });
  it('a failed profile write cannot replace the old session or lose its notes', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    signedIn(); await start(); await runtime.save([note('Preserve on disk failure')], []);
    spyOn(AuthService.prototype, 'signIn').and.resolveTo(loginResult('456', 'other@example.invalid'));
    const write = disk.set;
    disk.set = async (key: string, value: any) => { if (key.startsWith('notes.local-profile.v1:')) throw new Error('disk failed'); return write(key, value); };
    const token = secure.get('ssToken');
    await expectAsync(runtime.signIn('other@example.invalid', 'synthetic-password')).toBeRejected();
    expect(secure.get('ssToken')).toBe(token);
    expect(runtime.snapshot().notes[0].title).toBe('Preserve on disk failure');
  });
  it('restores the prior local account after an interrupted session installation', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    signedIn(); await start(); await runtime.save([note('Survives interrupted switch')], []);
    const before = storage.get('notes'), token = secure.get('ssToken');
    spyOn(AuthService.prototype, 'signIn').and.resolveTo(loginResult('456', 'other@example.invalid'));
    spyOn(AuthService.prototype, 'prepareProtectedSession').and.rejectWith(new Error('secure store failed'));
    await expectAsync(runtime.signIn('other@example.invalid', 'synthetic-password')).toBeRejectedWithError('localAccountReloadRequired');
    expect(storage.get('notes')).toBe(before); expect(secure.get('ssToken')).toBe(token);
    await start();
    expect(runtime.snapshot().notes[0].title).toBe('Survives interrupted switch');
    expect(runtime.snapshot().user.email).toBe('runtime@example.invalid');
  });
  it('hides empty legacy folders like desktop and never assigns unfiled notes to them', async () => {
    await start(); await runtime.save([note('Unfiled note')], []); runtime.dispose();
    const blankId = '41d4b853-b835-443f-900c-3908436ed231';
    storage.set('folders', JSON.stringify([{ id: blankId, name: '', deleted: false, last_modified: Date.now() }]));
    await start();
    expect(runtime.snapshot().folders).toEqual([]);
    expect(runtime.snapshot().notes[0].folder).toBe('');
    await runtime.save(runtime.snapshot().notes, runtime.snapshot().folders);
    expect(JSON.parse(storage.get('notes'))[0].folder_id).toBeNull();
    expect(JSON.parse(storage.get('folders')).some((f: any) => f.id === blankId && !f.deleted)).toBeTrue();
  });
  it('redownloads an acknowledged note with an unresolved folder instead of permanently caching the missing membership', async () => {
    signedIn();
    const id = note().id, oldId = crypto.randomUUID(), activeId = crypto.randomUUID();
    storage.set('notes', JSON.stringify([{ id, title: 'Fixture', text: '<p>Retained fixture</p>', folder: '', folder_id: oldId, last_modified: 100, base_version: 100 }]));
    storage.set('folders', JSON.stringify([{ id: oldId, name: '', deleted: true, last_modified: 200 }, { id: activeId, name: 'Dudu', last_modified: 300 }]));
    const keys = new CryptoKeyService(); await keys.importEAK(root);
    remote.set(id, { id, title: packCipherBlob(await keys.encryptText('Fixture', id + '#title')),
      text: packCipherBlob(await keys.encryptText('<p>Retained fixture</p>', id)), folder_id: oldId,
      folder: packCipherBlob(await keys.encryptText('Dudu', oldId + '#folder-name')), last_modified: 100 });
    remoteFolders = [{ id: oldId, name: '', deleted: true, last_modified: 200 },
      { id: activeId, name: packCipherBlob(await keys.encryptText('Dudu', activeId + '#folder-name')), last_modified: 300 }];
    await start(); await runtime.sync();
    const downloads = () => http.post.calls.allArgs().filter((args: any[]) => args[0].endsWith('/download'));
    expect(downloads()[0][1].known_notes[id]).toBeUndefined();
    expect(runtime.snapshot().notes[0].folder).toBe('Dudu');
    expect(runtime.snapshot().notes[0].html).toBe('<p>Retained fixture</p>');
    expect(JSON.parse(storage.get('notes'))[0].folder_id).toBe(activeId);
    await runtime.sync();
    expect(downloads()[downloads().length - 1][1].known_notes[id]).toBe(100);
  });
  it('logs out after sync, removes session access and preserves the account profile for later login', async () => {
    const revoke = spyOn(IdentityAuthService.prototype, 'logout').and.resolveTo();
    signedIn(); await start(); await runtime.save([note()], []); await runtime.sync();
    await runtime.logout();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(runtime.snapshot().loggedIn).toBeFalse();
    expect(runtime.snapshot().notes).toEqual([]);
    for (const key of ['ssToken', 'ssUser', 'ssEakB64', 'ssEakB64_Encrypted']) expect(secure.has(key)).toBeFalse();
    const profiles = new LocalAccountProfiles(disk, { getItem: async (key: string) => secure.get(key) || null } as any);
    const profile = await profiles.load('123');
    expect(profile?.notes[0].title).toBe('Private title');
    expect(profile?.notes[0].text).toBe('<p>Private content</p>');
  });
  it('blocks logout while changes are still queued offline', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    signedIn(); await start(); await runtime.save([note()], []);
    await expectAsync(runtime.logout()).toBeRejectedWithError('syncPending');
    expect(secure.get('ssToken')).toBe('a'.repeat(40));
    expect(runtime.snapshot().notes.length).toBe(1);
  });
  it('uses WebSocket hints to fetch and decrypt remote changes through the Notes API', async () => {
    spyOnProperty(document, 'hidden', 'get').and.returnValue(false);
    class FakeSocket {
      onmessage: any; onopen: any; onclose: any; onerror: any;
      closed = false;
      constructor(readonly url: string) { sockets.push(this); }
      close() { this.closed = true; }
    }
    nativeWebSocket = window.WebSocket;
    (window as any).WebSocket = FakeSocket;
    signedIn(); await start(true);
    await waitFor(() => sockets.length === 1).catch(() => { throw new Error(JSON.stringify({ sockets: sockets.length, online: navigator.onLine, hidden: document.hidden, loggedIn: runtime.snapshot().loggedIn, urls: http.post.calls.allArgs().map((args: any[]) => args[0]) })); });
    expect(sockets[0].url).not.toContain(root);
    expect(sockets[0].url).not.toContain('a'.repeat(40));
    const crypto = new CryptoKeyService(); await crypto.importEAK(root);
    const id = note().id;
    remote.set(id, { id, title: packCipherBlob(await crypto.encryptText('From another device', id + '#title')),
      text: packCipherBlob(await crypto.encryptText('<p>Remote edit</p>', id)), last_modified: Date.now(), folder: '', folder_id: null });
    sockets[0].onmessage({ data: JSON.stringify({ type: 'notes.changed' }) });
    await waitFor(() => runtime.snapshot().notes.some((item: any) => item.title === 'From another device'));
    expect(runtime.snapshot().notes[0].html).toBe('<p>Remote edit</p>');
    runtime.dispose(); expect(sockets[0].closed).toBeTrue();
  });
});
