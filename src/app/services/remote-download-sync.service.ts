import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { App } from '@capacitor/app';
import { decryptTextWithMK, unpackCipherBlob } from '@stellarsecurity/stellar-crypto';
import { AppsflyerService } from './appsflyer.service';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';
import { DataService } from './data.service';
import { NotesApiV1Service } from './notes-api-v1.service';
import { NotesService } from './notes.service';
import { OutboxStorage } from './outbox-storage.service';
import { SecureStorageService } from './secure-storage.service';
import { Folder } from '../models/Folder';
import { NoteV1 } from '../models/NoteV1';

export type RemoteSyncReason = 'startup' | 'resume' | 'online' | 'manual' | 'realtime' | 'upload_ack';

@Injectable({ providedIn: 'root' })
export class RemoteDownloadSyncService {
  private static readonly POLL_MS = 30_000;
  private static readonly TELEMETRY_MIN_MS = 300_000;

  private started = false;
  private pollTimer: any = null;
  private inFlight: Promise<boolean> | null = null;
  private realtimeRequested = false;
  private lastTelemetryAt = 0;
  private readonly syncAppliedSubject = new BehaviorSubject<number>(0);

  readonly syncApplied$ = this.syncAppliedSubject.asObservable();

  constructor(
    private notesApi: NotesApiV1Service,
    private notesService: NotesService,
    private cryptoService: CryptoService,
    private secureStorage: SecureStorageService,
    private dataService: DataService,
    private authService: AuthService,
    private outbox: OutboxStorage,
    private appsflyer: AppsflyerService,
    private zone: NgZone,
  ) {}

  init(): void {
    if (this.started) return;
    this.started = true;

    this.startTimer();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      window.addEventListener('stellar:notes-changed', this.handleRealtimeHint);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void this.requestImmediateSync('resume');
      });
    }

    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void this.requestImmediateSync('resume');
    });

    void this.requestImmediateSync('startup');
  }

  async requestImmediateSync(reason: RemoteSyncReason = 'manual'): Promise<boolean> {
    if (this.inFlight) {
      if (reason === 'realtime' || reason === 'upload_ack') this.realtimeRequested = true;
      return this.inFlight;
    }

    this.inFlight = (async () => {
      let applied = false;
      do {
        this.realtimeRequested = false;
        applied = await this.performSync(reason) || applied;
      } while (this.realtimeRequested);
      return applied;
    })().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private startTimer(): void {
    if (this.pollTimer != null) return;
    this.pollTimer = setInterval(() => {
      void this.requestImmediateSync('manual');
    }, RemoteDownloadSyncService.POLL_MS);
  }

  private handleOnline = (): void => {
    void this.requestImmediateSync('online');
  };

  private handleOffline = (): void => {
    if (this.authService.isLoggedIn) this.dataService.setForceDownloadOnHome(true);
  };

  private handleRealtimeHint = (): void => {
    void this.requestImmediateSync('realtime');
  };

  private hasInternetConnection(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }

  private b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  private normalizeFolderId(folderId: any): string | null {
    return typeof folderId === 'string' && folderId.trim().length > 0 ? folderId.trim() : null;
  }

  private async getMkRaw(): Promise<Uint8Array | null> {
    try {
      if (!this.notesService.appHasPasswordChallenge()) {
        const eakB64 = await this.secureStorage.getItem('ssEakB64');
        return eakB64 ? this.b64ToBytes(eakB64) : null;
      }

      const enc = await this.secureStorage.getItem('ssEakB64_Encrypted');
      const appPass = this.notesService.getNotesAppPassword();
      if (!enc || !appPass) return null;
      const decrypted = this.cryptoService.decrypt(enc, appPass) as string;
      return decrypted ? this.b64ToBytes(decrypted) : null;
    } catch {
      return null;
    }
  }

  private getStoredNotes(password = ''): NoteV1[] {
    try {
      const raw = this.notesService.getNotes();
      const decoded = this.notesService.appHasPasswordChallenge()
        ? this.cryptoService.decrypt(raw, password || this.notesService.getNotesAppPassword())
        : raw;
      const parsed = decoded ? JSON.parse(decoded) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((note: any) => ({
        ...note,
        favorite: !!note?.favorite,
        pinned: !!note?.pinned,
        folder: (note?.folder ?? '').trim(),
        folder_id: this.normalizeFolderId(note?.folder_id),
      }));
    } catch {
      return [];
    }
  }

  private getStoredFolders(password = ''): Folder[] {
    try {
      const raw = this.notesService.getFolders();
      const decoded = this.notesService.appHasPasswordChallenge()
        ? this.cryptoService.decrypt(raw, password || this.notesService.getNotesAppPassword())
        : raw;
      const parsed = decoded ? JSON.parse(decoded) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((folder: any) => ({
          id: this.normalizeFolderId(folder?.id) ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
          name: (folder?.name ?? '').trim(),
          last_modified: Number(folder?.last_modified ?? Date.now()),
          deleted: !!folder?.deleted,
        }))
        .filter((folder: Folder) => folder.name.length > 0 || folder.deleted);
    } catch {
      return [];
    }
  }

  private async decryptFolderNames(serverFolders: any[], mkRaw: Uint8Array): Promise<Map<string, string>> {
    const folderNameById = new Map<string, string>();
    for (const folder of serverFolders ?? []) {
      const folderId = this.normalizeFolderId(folder?.id);
      if (!folderId) continue;
      let name = folder?.deleted ? '' : String(folder?.name ?? '').trim();
      if (!folder?.deleted && name) {
        try {
          const blob = unpackCipherBlob(name);
          name = await decryptTextWithMK(mkRaw, { ...blob, v: 1, aad_b64: btoa(folderId + '#folder-name') });
        } catch {
          name = String(folder?.name ?? '').trim();
        }
      }
      folderNameById.set(folderId, name);
    }
    return folderNameById;
  }

  private async performSync(reason: RemoteSyncReason): Promise<boolean> {
    const startedAt = Date.now();
    let status: 'ok' | 'skipped' | 'failed' = 'skipped';
    let downloadedCount = 0;
    let outboxCount = 0;

    try {
      if (!this.authService.isLoggedIn || !this.hasInternetConnection() || this.notesService.shouldAskForPassword()) {
        this.dataService.setForceDownloadOnHome(this.authService.isLoggedIn);
        return false;
      }

      const sessionToken = await this.secureStorage.getItem('ssToken');
      const mkRaw = await this.getMkRaw();
      if (!sessionToken || !mkRaw) {
        this.dataService.setForceDownloadOnHome(true);
        return false;
      }

      const localNotes = this.getStoredNotes(this.notesService.getNotesAppPassword());
      const knownNotes: Record<string, number> = {};
      for (const note of localNotes) {
        if (!this.notesService.hasAnyPendingMutation(note.id)) knownNotes[note.id] = Number(note.last_modified ?? 0);
      }

      const response = await this.notesApi.download(0, 1000, knownNotes);
      if (!this.authService.isLoggedIn || sessionToken !== await this.secureStorage.getItem('ssToken')) return false;

      const queuedUploads = new Set<string>();
      const outboxItems = await this.outbox.getAll();
      outboxCount = outboxItems.length;
      for (const op of outboxItems) {
        if (op.type === 'upload') for (const note of op.payload.notes ?? []) queuedUploads.add(note.id);
      }

      const serverNotes = Array.isArray(response?.notes) ? response.notes : [];
      const serverFolders = Array.isArray((response as any)?.folders) ? (response as any).folders : [];
      const folderNames = await this.decryptFolderNames(serverFolders, mkRaw);
      const confirmations: any[] = [];
      const map = new Map<string, any>(localNotes.map(note => [note.id, note]));
      let applied = false;

      for (const serverNote of serverNotes) {
        const local = map.get(serverNote.id);
        if (queuedUploads.has(serverNote.id)) continue;

        if (serverNote.deleted) {
          if (map.delete(serverNote.id)) applied = true;
          confirmations.push(serverNote);
          continue;
        }

        if (this.notesService.shouldIgnoreServerNote(serverNote)) continue;

        try {
          const blobText = unpackCipherBlob(serverNote.text);
          const decryptedText = await decryptTextWithMK(mkRaw, { ...blobText, v: 1, aad_b64: btoa(serverNote.id) });
          let decryptedTitle = '';
          if (typeof serverNote.title === 'string' && serverNote.title.length > 0) {
            const blobTitle = unpackCipherBlob(serverNote.title);
            decryptedTitle = await decryptTextWithMK(mkRaw, { ...blobTitle, v: 1, aad_b64: btoa(serverNote.id + '#title') });
          }

          const folderId = this.normalizeFolderId(serverNote.folder_id);
          const normalizedServerNote = {
            ...serverNote,
            text: decryptedText,
            title: decryptedTitle,
            favorite: !!(serverNote.favorite ?? local?.favorite),
            pinned: !!(serverNote.pinned ?? local?.pinned),
            folder: folderId ? (folderNames.get(folderId) ?? '') : '',
            folder_id: folderId,
          };

          if (!local || Number(normalizedServerNote.last_modified ?? 0) >= Number(local.last_modified ?? 0)) {
            map.set(normalizedServerNote.id, { ...local, ...normalizedServerNote });
            applied = true;
          }
          confirmations.push(normalizedServerNote);
        } catch {
          // One unreadable encrypted note must not block the rest of the account.
        }
      }

      const folderMap = new Map<string, any>();
      for (const folder of this.getStoredFolders(this.notesService.getNotesAppPassword())) {
        const key = this.normalizeFolderId(folder.id) ?? `name:${(folder.name ?? '').trim().toLowerCase()}`;
        folderMap.set(key, folder);
      }
      for (const folder of serverFolders) {
        const id = this.normalizeFolderId(folder?.id) ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
        const normalized = { id, name: folder?.deleted ? '' : (folderNames.get(id) ?? '').trim(), last_modified: Number(folder?.last_modified ?? 0), deleted: !!folder?.deleted };
        const local = folderMap.get(id);
        if (!local || normalized.last_modified >= Number(local.last_modified ?? 0)) {
          folderMap.set(id, normalized);
          applied = true;
        }
      }

      if (!this.authService.isLoggedIn || sessionToken !== await this.secureStorage.getItem('ssToken')) return false;

      const currentNotes = this.getStoredNotes(this.notesService.getNotesAppPassword());
      const finalNotes = new Map(Array.from(map.values()).map(note => [note.id, note]));
      const remoteDeleted = new Set(serverNotes.filter((note: any) => note.deleted && !queuedUploads.has(note.id)).map((note: any) => note.id));
      for (const current of currentNotes) {
        if (remoteDeleted.has(current.id)) continue;
        const previous = finalNotes.get(current.id);
        if (!previous || this.notesService.hasAnyPendingMutation(current.id) || Number(current.last_modified ?? 0) > Number(previous.last_modified ?? 0)) {
          finalNotes.set(current.id, current);
        }
      }

      const safeNotes = Array.from(finalNotes.values()).filter((note: any) => !note.deleted && !this.notesService.hasPendingDelete(note.id));
      for (const note of safeNotes) {
        const folder = folderMap.get(this.normalizeFolderId(note.folder_id) ?? '');
        if (folder) note.folder = folder.deleted ? '' : folder.name;
      }

      const folders = Array.from(folderMap.values()).filter((folder: any) => folder.name || folder.deleted);
      const appPassword = this.notesService.getNotesAppPassword();
      const serializedNotes = JSON.stringify(safeNotes);
      const serializedFolders = JSON.stringify(folders);
      if (this.notesService.appHasPasswordChallenge()) {
        this.notesService.setNotes(this.cryptoService.encrypt(serializedNotes, appPassword));
        this.notesService.setFolders(this.cryptoService.encrypt(serializedFolders, appPassword));
      } else {
        this.notesService.setNotes(serializedNotes);
        this.notesService.setFolders(serializedFolders);
      }
      this.notesService.setDecryptedNotes(serializedNotes);

      for (const confirmation of confirmations) {
        if (!this.notesService.hasAnyPendingMutation(confirmation.id) || confirmation.deleted) {
          this.notesService.reconcileServerConfirmation(confirmation);
        }
      }

      await this.notesService.flushPersistence();
      this.dataService.setForceDownloadOnHome(false);
      downloadedCount = serverNotes.length;
      status = 'ok';
      if (applied || downloadedCount > 0 || serverFolders.length > 0) {
        this.zone.run(() => {
          this.notesService.refreshRequested$.next();
          this.syncAppliedSubject.next(Date.now());
        });
      }
      return applied;
    } catch {
      status = 'failed';
      this.dataService.setForceDownloadOnHome(true);
      return false;
    } finally {
      this.trackSyncMetric(reason, status, Date.now() - startedAt, downloadedCount, outboxCount);
    }
  }

  private trackSyncMetric(reason: RemoteSyncReason, status: 'ok' | 'skipped' | 'failed', durationMs: number, downloadedCount: number, outboxCount: number): void {
    const now = Date.now();
    if (status === 'ok' && now - this.lastTelemetryAt < RemoteDownloadSyncService.TELEMETRY_MIN_MS) return;
    this.lastTelemetryAt = now;
    void this.appsflyer.logEvent('notes_sync_metric', {
      platform: 'mobile',
      reason,
      status,
      duration_bucket: this.durationBucket(durationMs),
      downloaded_bucket: this.countBucket(downloadedCount),
      outbox_bucket: this.countBucket(outboxCount),
      websocket_hint: reason === 'realtime' ? 'true' : 'false',
    });
  }

  private durationBucket(ms: number): string {
    if (ms < 500) return 'lt_500ms';
    if (ms < 1500) return 'lt_1500ms';
    if (ms < 5000) return 'lt_5s';
    if (ms < 15000) return 'lt_15s';
    return 'gte_15s';
  }

  private countBucket(count: number): string {
    if (count <= 0) return '0';
    if (count === 1) return '1';
    if (count <= 5) return '2_5';
    if (count <= 20) return '6_20';
    return 'gt_20';
  }
}
