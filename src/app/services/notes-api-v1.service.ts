// services/notes-api-v1.service.ts — OFFLINE-FIRST (keeps your public methods)
import { confirmUpload } from './upload-confirmation';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { NoteV1 } from "../models/NoteV1";
import { Folder } from "../models/Folder";

import { CryptoKeyService } from "./crypto-key.service";
import { SecureStorageService } from "./secure-storage.service";
import { OutboxOp } from "../models/Sync";
import { OutboxStorage } from "./outbox-storage.service";

// ✅ Shared crypto helpers from NPM (wire format)
import { packCipherBlob, unpackCipherBlob } from '@stellarsecurity/stellar-crypto';
import { buildApiUrl, notes } from '../constants/api/product.api';
import { normalizeNoteSyncFlags, normalizeNoteSyncFlagsList } from '../utils/note-sync-normalize.util';
import { NotesService } from './notes.service';
import { BackgroundNotesSyncService } from './background-notes-sync.service';

@Injectable({ providedIn: 'root' })
export class NotesApiV1Service {
  private readonly editSession = globalThis.crypto.randomUUID();
  private base = buildApiUrl(notes.controller);

  // legacy key (bruges kun af private helpers, hvis du stadig vil have dem)
  private OUTBOX_KEY = 'notes.sync.outbox.v1';

  constructor(
    private http: HttpClient,
    private secureStorageService: SecureStorageService,
    private crypto: CryptoKeyService,
    private outbox: OutboxStorage,
    private backgroundSync: BackgroundNotesSyncService,
    private notesState: NotesService,
  ) {}


  private normalizeFolderId(folderId: any): string | null {
    return typeof folderId === 'string' && folderId.trim().length > 0 ? folderId.trim() : null;
  }

  private isCipherBlobString(value: any): boolean {
    return typeof value === 'string' && value.includes(':') && value.split(':').length >= 3;
  }

  private async encryptFolderName(folderName: string, folderId: string): Promise<string> {
    const normalizedName = typeof folderName === 'string' ? folderName.trim() : '';
    if (!normalizedName) {
      return '';
    }

    const encrypted = await this.crypto.encryptText(normalizedName, `${folderId}#folder-name`);
    return packCipherBlob(encrypted);
  }

  private async decryptFolderName(folderName: any, folderId: string): Promise<string> {
    const rawName = typeof folderName === 'string' ? folderName.trim() : '';
    if (!rawName) {
      return '';
    }

    if (!this.isCipherBlobString(rawName)) {
      return rawName;
    }

    try {
      return await this.crypto.decryptText(unpackCipherBlob(rawName), `${folderId}#folder-name`);
    } catch {
      return rawName;
    }
  }

  private async decryptLegacyNoteFolder(folderName: any, folderId: string, fallbackName = ''): Promise<string> {
    const rawName = typeof folderName === 'string' ? folderName.trim() : '';
    if (!rawName) {
      return fallbackName;
    }

    if (!this.isCipherBlobString(rawName)) {
      return rawName;
    }

    try {
      return await this.crypto.decryptText(unpackCipherBlob(rawName), `${folderId}#folder-name`);
    } catch {
      return fallbackName || rawName;
    }
  }

  // --------------------------------------------------
  // PUBLIC: upload
  // --------------------------------------------------
  async upload(
    sinceMs: number,
    notes: ReadonlyArray<NoteV1>,
    opId?: string,
    folders: ReadonlyArray<Folder> = [],
    queueOnly = false
  ): Promise<object> {
    const TOKEN = await this.secureStorageService.getItem("ssToken");
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    // 1) Load EAK → MK into CryptoKeyService (RAM) if we have it
    const eakB64 = await this.secureStorageService.getItem("ssEakB64");
    if (eakB64) {
      await this.crypto.importEAK(eakB64);
    }

    const normalizedFolders = (Array.isArray(folders) ? folders : []).map((folder: any) => ({
      id: this.normalizeFolderId(folder?.id) ?? (crypto?.randomUUID?.() ?? String(Date.now() + Math.random())),
      name: typeof folder?.name === 'string' ? folder.name.trim() : '',
      last_modified: Number(folder?.last_modified ?? Date.now()),
      deleted: !!folder?.deleted,
    })).filter((folder: any) => folder.name || folder.deleted);

    const folderIdByName = new Map<string, string>();
    for (const folder of normalizedFolders) {
      const normalizedName = (folder?.name ?? '').trim().toLowerCase();
      if (normalizedName) {
        folderIdByName.set(normalizedName, folder.id);
      }
    }

    const encryptedFolders: Folder[] = [];
    for (const folder of normalizedFolders) {
      encryptedFolders.push({
        ...folder,
        name: folder.deleted ? '' : await this.encryptFolderName(folder.name, folder.id),
      });
    }

    // 2) Encrypt each note body + title + folder metadata via CryptoKeyService (MK in RAM)
    const encryptedNotes: any[] = [];
    for (const rawNote of normalizeNoteSyncFlagsList(notes)) {
      const n = normalizeNoteSyncFlags(rawNote);
      const encText  = await this.crypto.encryptText(n.text  ?? '', n.id);
      const encTitle = await this.crypto.encryptText(n.title ?? '', n.id + '#title');
      const normalizedFolderName = (n.folder ?? '').trim();
      const normalizedFolderId = this.normalizeFolderId((n as any)?.folder_id)
        ?? (normalizedFolderName ? (folderIdByName.get(normalizedFolderName.toLowerCase()) ?? null) : null);

      encryptedNotes.push({
        ...n,
        checksum_hmac: await this.crypto.noteChecksum(JSON.stringify([
          n.id, n.last_modified, n.text ?? '', n.title ?? '', !!n.protected, !!n.favorite,
          !!n.pinned, !!n.deleted, !!n.auto_wipe, normalizedFolderId, normalizedFolderName
        ])),
        edit_session: this.editSession,
        text: packCipherBlob(encText),
        title: packCipherBlob(encTitle),
        folder: normalizedFolderName && normalizedFolderId
          ? await this.encryptFolderName(normalizedFolderName, normalizedFolderId)
          : '',
        folder_id: normalizedFolderId,
      });
    }

    const payload = {
      op_id: opId ?? crypto?.randomUUID?.() ?? String(Date.now()),
      since: sinceMs || 0,
      require_note_ack: true,
      notes: encryptedNotes,
      folders: encryptedFolders,
    } as any;

    // Persist first so suspending or killing the WebView cannot lose this mutation.
    await this.outbox.enqueue(<OutboxOp><unknown>{
      opId: payload.op_id,
      type: 'upload',
      payload,
      attempt: 0,
      nextAt: Date.now(),
    });

    if (queueOnly) return { queued: true, reason: 'durable' };
    if (!navigator.onLine) {
      return { queued: true, reason: 'offline' };
    }

    try {
      if (!environment.production) console.info('Notes upload started', JSON.stringify({ notes: encryptedNotes.length }));
      const res = await firstValueFrom(
        this.http.post<object>(`${this.base}upload`, payload, { headers }).pipe(timeout(15000))
      );
      await confirmUpload(this.http, this.base, headers, payload, res);
      await this.outbox.drop([payload.op_id]);
      // Acknowledging an older upload must not clear a newer local edit.
      for (const note of encryptedNotes) {
        const pending = this.notesState.getPendingMutation(note.id);
        if (pending && pending.type !== 'delete' && pending.localUpdatedAt <= Number(note.last_modified)) {
          this.notesState.clearPendingMutation(note.id);
        }
      }
      if (!environment.production) console.info('Notes upload acknowledged', JSON.stringify({ notes: encryptedNotes.length }));
      return res;
    } catch (error: any) {
      if (error?.status === 409 || error?.message === 'Note upload was not confirmed') {
        await this.outbox.update(payload.op_id, item => ({ ...item, conflict: true }));
      }
      if (error?.status === 409 || error?.message === 'Note upload was not confirmed') this.notesState.syncNeedsAttention$.next(true);
      console.warn('Notes upload queued', JSON.stringify({ status: error?.status ?? 0, error: error?.name ?? 'Error' }));
      return { queued: true, reason: 'network_error' };
    }
  }

  // --------------------------------------------------
  // PUBLIC: download
  // --------------------------------------------------
  async download(
    sinceMs: number,
    limit = 1000,
    knownNotes?: Record<string, number>
  ): Promise<{ notes: NoteV1[]; folders: Folder[]; has_more?: boolean; watermark?: number }> {
    const TOKEN = await this.secureStorageService.getItem('ssToken');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    const backgroundResponses = await this.backgroundSync.consumeDownloaded();
    let foregroundResponse: any = null;
    if (navigator.onLine) {
      foregroundResponse = await firstValueFrom(
        this.http.post<{ notes: NoteV1[]; folders?: Folder[]; has_more?: boolean; watermark?: number }>(
          `${this.base}download`,
          { since: sinceMs || 0, limit, ...(knownNotes ? { known_notes: knownNotes } : {}) },
          { headers }
        ).pipe(timeout(15000))
      ).catch(error => {
        if (!environment.production) console.warn('Notes download failed', JSON.stringify({
          status: error?.status ?? 0,
          type: error?.name,
          message: error?.error?.response_message ?? error?.error?.message,
          exception: error?.error?.exception,
        }));
        // Native results were consumed above. A foreground failure must not discard them.
        if (backgroundResponses.length > 0) return null;
        throw error;
      });
      if (!environment.production) console.info('Notes download received', JSON.stringify({ notes: foregroundResponse?.notes?.length ?? 0 }));
    }

    const response = this.mergeDownloadResponses([
      ...backgroundResponses,
      ...(foregroundResponse ? [foregroundResponse] : []),
    ], sinceMs);

    const decryptedFolders: Folder[] = [];
    for (const folder of Array.isArray(response?.folders) ? response.folders : []) {
      const folderId = this.normalizeFolderId((folder as any)?.id) ?? '';
      const decryptedName = folder.deleted
        ? ''
        : await this.decryptFolderName(folder?.name, folderId);

      if (!folderId && !decryptedName) {
        continue;
      }

      decryptedFolders.push({
        id: folderId,
        name: decryptedName,
        last_modified: Number(folder?.last_modified ?? 0),
        deleted: !!folder?.deleted,
      });
    }

    const folderNameById = new Map<string, string>();
    for (const folder of decryptedFolders) {
      const folderId = this.normalizeFolderId(folder.id);
      if (folderId && !folder.deleted) {
        folderNameById.set(folderId, folder.name ?? '');
      }
    }

    const decryptedNotes: NoteV1[] = [];
    for (const rawNote of normalizeNoteSyncFlagsList<NoteV1>(response?.notes)) {
      const note = normalizeNoteSyncFlags(rawNote) as NoteV1;
      const noteFolderId = this.normalizeFolderId((note as any)?.folder_id);
      const resolvedFolderName = noteFolderId ? (folderNameById.get(noteFolderId) ?? '') : '';
      const decryptedFolderName = await this.decryptLegacyNoteFolder(note?.folder, noteFolderId ?? `${note.id}#folder`, resolvedFolderName);

      decryptedNotes.push({
        ...note,
        base_version: Number(note.last_modified ?? 0),
        folder: decryptedFolderName || resolvedFolderName || '',
        folder_id: noteFolderId,
      });
    }

    return {
      ...response,
      notes: decryptedNotes,
      folders: decryptedFolders,
    };
  }

  private mergeDownloadResponses(responses: any[], sinceMs: number): any {
    const mergeById = (field: 'notes' | 'folders') => {
      const values = new Map<string, any>();
      for (const response of responses) {
        for (const value of Array.isArray(response?.[field]) ? response[field] : []) {
          const id = typeof value?.id === 'string' ? value.id : '';
          if (!id) continue;
          const current = values.get(id);
          if (!current || Number(value?.last_modified ?? 0) >= Number(current?.last_modified ?? 0)) {
            values.set(id, value);
          }
        }
      }
      return Array.from(values.values());
    };

    return {
      notes: mergeById('notes'),
      folders: mergeById('folders'),
      has_more: responses.some(response => !!response?.has_more),
      watermark: responses.reduce(
        (maximum, response) => Math.max(maximum, Number(response?.watermark ?? 0)),
        sinceMs || 0
      ),
    };
  }

  // --------------------------------------------------
  // PUBLIC: find
  // --------------------------------------------------
  async find(id: string): Promise<NoteV1> {
    const TOKEN = await this.secureStorageService.getItem("ssToken");
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    if (!navigator.onLine) {
      throw new Error('offline');
    }

    const note = await firstValueFrom(
      this.http.post<NoteV1>(`${this.base}find`, { id }, { headers })
    );

    return note ? normalizeNoteSyncFlags({ ...note, base_version: Number(note.last_modified ?? 0) }) : note;
  }

  // --------------------------------------------------
  // PUBLIC: deleteNotes
  // --------------------------------------------------
  async deleteNotes(deletedIds: string[]) {
    const TOKEN = await this.secureStorageService.getItem("ssToken");
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    const payload = {
      op_id: crypto?.randomUUID?.() ?? 'del-' + Date.now(),
      since: 0,
      notes: [],
      deleted_ids: deletedIds ?? [],
    } as any;

    await this.outbox.enqueue(<OutboxOp>{
      opId: payload.op_id,
      type: 'delete',
      payload,
      attempt: 0,
      nextAt: Date.now(),
    });

    if (!navigator.onLine) {
      return { queued: true, reason: 'offline' } as any;
    }

    try {
      const response = await firstValueFrom(
        this.http.post(
          `${this.base}sync-plan`,
          { deleted_ids: deletedIds, notes: [] },
          { headers }
        ).pipe(timeout(15000))
      );
      await this.outbox.drop([payload.op_id]);
      return response;
    } catch (e: any) {
      return { queued: true, reason: 'network_error' } as any;
    }
  }

  // --------------------------------------------------
  // PRIVATE legacy helpers (kan fjernes hvis du kun bruger OutboxStorage)
  // --------------------------------------------------
  private async enqueuePayload(p: any): Promise<void> {
    const raw = (await this.secureStorageService.getItem(this.OUTBOX_KEY)) ?? '[]';
    let queue: any[] = [];
    try { queue = JSON.parse(raw); } catch { queue = []; }
    queue.push(p);
    await this.secureStorageService.setItem(this.OUTBOX_KEY, JSON.stringify(queue));
  }

  private async drainOutbox(headers: HttpHeaders): Promise<void> {
    if (!navigator.onLine) return;
    const raw = (await this.secureStorageService.getItem(this.OUTBOX_KEY)) ?? '[]';
    let queue: any[] = [];
    try { queue = JSON.parse(raw); } catch { queue = []; }
    if (!Array.isArray(queue) || queue.length === 0) return;

    const remain: any[] = [];
    for (const payload of queue) {
      try {
        const isDeleteOnly =
          Array.isArray(payload.deleted_ids) && (payload.notes?.length ?? 0) === 0;

        if (isDeleteOnly) {
          await firstValueFrom(
            this.http.post(
              `${this.base}sync-plan`,
              { deleted_ids: payload.deleted_ids, notes: [] },
              { headers }
            )
          );
        } else {
          await firstValueFrom(
            this.http.post(`${this.base}upload`, payload, { headers })
          );
        }
      } catch (error: any) {
        remain.push(payload);
        break;
      }
    }

    await this.secureStorageService.setItem(this.OUTBOX_KEY, JSON.stringify(remain));
  }
}
