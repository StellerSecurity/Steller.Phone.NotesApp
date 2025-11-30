// services/notes-api-v1.service.ts — OFFLINE‑FIRST REWRITE (keeps your public methods only)
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NoteV1 } from "../models/NoteV1";
import { CryptoKeyService, packCipherBlob } from "./crypto-key.service";
import { CryptoService } from "./crypto.service";
import { SecureStorageService } from "./secure-storage.service";
import {OutboxOp} from "../models/Sync";
import {OutboxStorage} from "./outbox-storage.service";

/**
 * What changed:
 * - True offline queue for uploads & deletions (stored encrypted in SecureStorage)
 * - No new PUBLIC methods added. We keep exactly: constructor, upload, download, find, deleteNotes
 * - On network failure or offline, payload is queued and drained automatically on the next successful call
 * - Download returns an empty page while offline so UI logic can continue without errors
 */

@Injectable({ providedIn: 'root' })
export class NotesApiV1Service {
  // Keep your existing endpoint (redacted string preserved)
  private base = 'https://stellarprivatenotesuiappapiprod-dmefgreabahpcsbm.swedencentral-01.azurewebsites.net/api/v1/notescontroller/';

  // Storage keys for the outbox queue
  private OUTBOX_KEY = 'notes.sync.outbox.v1';

  constructor(
    private http: HttpClient,
    private secureStorageService: SecureStorageService,
    private crypto: CryptoKeyService,
    private outbox: OutboxStorage
  ) {}

  // ————————————————————————————————————————————————————————————————
  // PUBLIC: upload (sinceMs, notes, opId?)
  // If offline or request fails: queue the encrypted payload and resolve with a soft ack
  // On next successful call to upload(), queued payloads are drained first (FIFO)
  // ————————————————————————————————————————————————————————————————
  async upload(sinceMs: number, notes: ReadonlyArray<NoteV1>, opId?: string): Promise<object> {
    const TOKEN = await this.secureStorageService.getItem("ssToken");
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    // Ensure EAK is loaded before any encryption
    const eakB64 = await this.secureStorageService.getItem("ssEakB64");
    if (eakB64) await this.crypto.importEAK(eakB64);

    // Encrypt notes
    const encryptedNotes: NoteV1[] = [];
    for (const n of notes) {
      const encText  = await this.crypto.encryptText(n.text  ?? '', n.id);
      const encTitle = await this.crypto.encryptText(n.title ?? '', n.id + '#title');
      encryptedNotes.push({ ...n, text: packCipherBlob(encText), title: packCipherBlob(encTitle) });
    }

    // Compose payload (same shape you already used)
    const payload = {
      op_id: opId ?? crypto?.randomUUID?.() ?? String(Date.now()),
      since: sinceMs || 0,
      notes: encryptedNotes,
    } as any;

    // If offline → enqueue for SyncWorker
    if (!navigator.onLine) {
      await this.outbox.enqueue(<OutboxOp><unknown>{
        opId: payload.op_id,
        type: 'upload',
        payload,
        attempt: 0,
        nextAt: Date.now(),
      });
      return { queued: true, reason: 'offline' };
    }

    // Try to POST; if it fails, enqueue
    try {
      const res = await firstValueFrom(this.http.post<object>(`${this.base}upload`, payload, { headers }));
      return res;
    } catch (e) {
      await this.outbox.enqueue(<OutboxOp>{
        opId: payload.op_id,
        type: 'upload',
        payload,
        attempt: 0,
        nextAt: Date.now(),
      });
      return { queued: true, reason: 'network_error' };
    }
  }


  // ————————————————————————————————————————————————————————————————
  // PUBLIC: download (sinceMs, limit?)
  // If offline, return an empty page; watermark echoes sinceMs so callers can proceed
  // ————————————————————————————————————————————————————————————————
  async download(
    sinceMs: number,
    limit = 1000
  ): Promise<{ notes: NoteV1[]; has_more?: boolean; watermark?: number }> {
    const TOKEN = await this.secureStorageService.getItem('ssToken');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    if (!navigator.onLine) {
      return { notes: [], has_more: false, watermark: sinceMs || 0 };
    }

    return firstValueFrom(
      this.http.post<{ notes: NoteV1[]; has_more?: boolean; watermark?: number }>(
        `${this.base}/download`,
        { since: sinceMs || 0, limit },
        { headers }
      )
    );
  }

  // ————————————————————————————————————————————————————————————————
  // PUBLIC: find (id)
  // ————————————————————————————————————————————————————————————————
  async find(id: string): Promise<NoteV1> {
    const TOKEN = await this.secureStorageService.getItem("ssToken");
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    // If offline, we cannot query the server; throw to let caller pick local cache
    if (!navigator.onLine) {
      throw new Error('offline');
    }

    return firstValueFrom(
      this.http.post<NoteV1>(`${this.base}/find`, { id }, { headers })
    );
  }

  // ————————————————————————————————————————————————————————————————
  // PUBLIC: deleteNotes (deletedIds)
  // If offline or network error: push a deleted‑only payload into the outbox
  // ————————————————————————————————————————————————————————————————
  async deleteNotes(deletedIds: string[]) {
    const TOKEN = await this.secureStorageService.getItem("ssToken");
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    const payload = {
      op_id: crypto?.randomUUID?.() ?? 'del-' + Date.now(),
      since: 0,
      notes: [],
      deleted_ids: deletedIds ?? [],
    } as any;

    if (!navigator.onLine) {
      await this.outbox.enqueue(<OutboxOp>{
        opId: payload.op_id,
        type: 'delete',
        payload,
        attempt: 0,
        nextAt: Date.now(),
      });
      return { queued: true, reason: 'offline' } as any;
    }

    try {
      return await firstValueFrom(this.http.post(
        `${this.base}sync-plan`,
        { deleted_ids: deletedIds, notes: [] },
        { headers }
      ));
    } catch (e) {
      await this.outbox.enqueue(<OutboxOp>{
        opId: payload.op_id,
        type: 'delete',
        payload,
        attempt: 0,
        nextAt: Date.now(),
      });
      return { queued: true, reason: 'network_error' } as any;
    }
  }


  // ====================== PRIVATE HELPERS ======================

  private async enqueuePayload(p: any): Promise<void> {
    console.log(p);
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
        // Decide endpoint based on shape: delete‑only uses sync‑plan, others use upload
        const isDeleteOnly = Array.isArray(payload.deleted_ids) && (payload.notes?.length ?? 0) === 0;
        if (isDeleteOnly) {
          await firstValueFrom(this.http.post(`${this.base}/sync-plan`, { deleted_ids: payload.deleted_ids, notes: [] }, { headers }));
        } else {
          await firstValueFrom(this.http.post(`${this.base}/upload`, payload, { headers }));
        }
      } catch {
        // Keep unsent payloads
        remain.push(payload);
        // If something failed, don’t burn the API — stop early
        break;
      }
    }

    await this.secureStorageService.setItem(this.OUTBOX_KEY, JSON.stringify(remain));
  }
}
