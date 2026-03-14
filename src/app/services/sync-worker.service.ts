// services/sync-worker.service.ts
import { Injectable, NgZone } from '@angular/core';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { OutboxStorage } from './outbox-storage.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SecureStorageService } from './secure-storage.service';
import { firstValueFrom } from 'rxjs';
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
    private secure: SecureStorageService
  ) {}

  init() {
    if (this.started) {
      return;
    }
    this.started = true;


    setInterval(() => this.trySync(), 10_000);
    Network.addListener('networkStatusChange', () => this.trySync());
    App.addListener('appStateChange', (s) => {
      if (s.isActive) {
        this.trySync();
      }
    });

    this.trySync();
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
      await firstValueFrom(
        this.http.post(`${this.base}${notes.upload}`, op.payload, { headers })
      );
      return;
    }

    if (op.type === 'delete') {
      const body = {
        deleted_ids: op.payload.deleted_ids ?? [],
        notes: [],
      };
      await firstValueFrom(
        this.http.post(`${this.base}${notes.syncPlan}`, body, { headers })
      );
      return;
    }

    throw new Error(`Unknown op type: ${op.type}`);
  }

  private applyFailure(
    nextQueue: OutboxOp[],
    opId: string,
    now: number
  ): OutboxOp[] {
    const updatedQueue: OutboxOp[] = [];

    for (const item of nextQueue) {
      if (item.opId !== opId) {
        updatedQueue.push(item);
        continue;
      }

      const attempt = (item.attempt ?? 0) + 1;
      if (attempt > MAX_ATTEMPT) {
        continue;
      }

      updatedQueue.push({
        ...item,
        attempt,
        nextAt: now + this.backoffMs(attempt),
      });
    }

    return updatedQueue;
  }

  async trySync() {
    if (this.syncing) {
      return;
    }

    if (!(await this.isOnline())) {
      return;
    }

    const headers = await this.authHeaders();
    if (!headers) {
      return;
    }

    this.syncing = true;
    try {
      const now = Date.now();
      const batch = await this.outbox.peekBatch(50, now);

      if (batch.length === 0) {
        return;
      }

      let nextQueue = await this.outbox.getAll();

      for (const op of batch) {
        try {
          await this.sendOp(op, headers);
          nextQueue = nextQueue.filter((item: OutboxOp) => item.opId !== op.opId);
        } catch (e) {
          nextQueue = this.applyFailure(nextQueue, op.opId, Date.now());
        }
      }

      await this.outbox.replace(nextQueue);
    } catch (e) {

      const now = Date.now();
      const batch = await this.outbox.peekBatch(50, now);
      if (batch.length > 0) {
        let nextQueue = await this.outbox.getAll();
        for (const op of batch) {
          nextQueue = this.applyFailure(nextQueue, op.opId, now);
        }
        await this.outbox.replace(nextQueue);
      }
    } finally {
      this.syncing = false;
    }
  }
}
