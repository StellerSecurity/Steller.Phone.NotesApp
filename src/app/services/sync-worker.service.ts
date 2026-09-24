// services/sync-worker.service.ts
import { confirmUpload } from './upload-confirmation';
import { Injectable, NgZone } from '@angular/core';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { OutboxStorage } from './outbox-storage.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SecureStorageService } from './secure-storage.service';
import { firstValueFrom, timeout } from 'rxjs';
import { NotesService } from './notes.service';
import { OutboxOp } from '../models/Sync';
import { buildApiUrl, notes } from '../constants/api/product.api';

const MAX_ATTEMPT = 8;

@Injectable({ providedIn: 'root' })
export class SyncWorkerService {
  private syncing = false;
  private started = false;

  private base = buildApiUrl(notes.controller);

  constructor(
    private http: HttpClient,
    private outbox: OutboxStorage,
    private zone: NgZone,
    private secure: SecureStorageService,
    private notesState: NotesService
  ) {}

  init() {
    if (this.started) {
      return;
    }
    this.started = true;


    setInterval(() => this.trySync(), 10_000);
    Network.addListener('networkStatusChange', (status) => {
      if (status.connected) void this.retryPending();
    });
    App.addListener('appStateChange', (s) => {
      if (s.isActive) {
        void this.retryPending();
      }
    });

    void this.retryPending();
  }

  private async isOnline(): Promise<boolean> {
    const st = await Network.getStatus();
    return st.connected ?? navigator.onLine;
  }

  private backoffMs(attempt: number): number {
    return Math.min(60_000, 1000 * Math.pow(2, Math.max(0, attempt - 1)));
  }

  private async authHeaders(): Promise<HttpHeaders | null> {
    const token = await this.secure.getItem('ssToken');
    if (!token) {
      return null;
    }

    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  private async sendOp(op: OutboxOp, headers: HttpHeaders): Promise<void> {
    if (op.type === 'upload') {
      const payload = { ...op.payload, require_note_ack: true };
      const response = await firstValueFrom(
        this.http.post(`${this.base}${notes.upload}`, payload, { headers }).pipe(timeout(15000))
      );
      await confirmUpload(this.http, this.base, headers, payload, response);
      return;
    }

    if (op.type === 'delete') {
      const body = {
        deleted_ids: op.payload.deleted_ids ?? [],
        notes: [],
      };
      await firstValueFrom(
        this.http.post(`${this.base}${notes.syncPlan}`, body, { headers }).pipe(timeout(15000))
      );
      return;
    }

    throw new Error(`Unknown op type: ${op.type}`);
  }

  async retryPending(): Promise<void> {
    try {
      await this.outbox.retryPending();
      await this.trySync();
    } catch {
      console.warn('Could not resume note synchronization; queued notes are retained.');
    }
  }

  private async isCurrentSession(headers: HttpHeaders, generation: number): Promise<boolean> {
    const token = await this.secure.getItem('ssToken');
    return !!token && headers.get('Authorization') === `Bearer ${token}` && generation === this.outbox.generation;
  }

  async trySync(): Promise<void> {
    if (this.syncing) return;
    // Acquire before the first await: timer, resume and reconnect can overlap.
    this.syncing = true;
    const generation = this.outbox.generation;
    try {
      if (!(await this.isOnline())) return;
      const headers = await this.authHeaders();
      if (!headers) return;
      const batch = await this.outbox.peekBatch(50, Date.now());
      for (const op of batch) {
        if (!await this.isCurrentSession(headers, generation)) return;
        if (op.conflict) continue;
        try {
          await this.sendOp(op, headers);
        } catch (error: any) {
          if (!await this.isCurrentSession(headers, generation)) return;
          if (error?.status === 409 || error?.message === 'Note upload was not confirmed') {
            this.notesState.syncNeedsAttention$.next(true);
          }
          await this.outbox.update(op.opId, item => {
            const attempt = (item.attempt ?? 0) + 1;
            // Keep retrying slowly after repeated failures; never discard or park forever.
            const delay = attempt > MAX_ATTEMPT ? 300_000 : this.backoffMs(attempt);
            return { ...item, conflict: item.conflict || error?.status === 409 || error?.message === 'Note upload was not confirmed', attempt, nextAt: Date.now() + delay };
          });
          continue;
        }
        if (!await this.isCurrentSession(headers, generation)) return;
        await this.outbox.drop([op.opId]);
        if (!(await this.outbox.getAll()).length) this.notesState.syncNeedsAttention$.next(false);
        for (const note of op.payload.notes ?? []) {
          const pending = this.notesState.getPendingMutation(note.id);
          if (pending && pending.type !== 'delete' && pending.localUpdatedAt <= Number(note.last_modified)) {
            this.notesState.clearPendingMutation(note.id);
          }
        }
      }
    } catch {
      // Storage/network-status failures leave the durable queue intact for the next run.
    } finally {
      this.syncing = false;
    }
  }
}
