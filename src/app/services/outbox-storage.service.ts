// src/app/services/outbox-storage.service.ts
import { Injectable } from '@angular/core';
import { Storage as IonicStorage } from '@ionic/storage-angular';
import { OutboxOp } from '../models/Sync';
import { BackgroundNotesSyncService } from './background-notes-sync.service';

const OUTBOX_KEY = 'notes.sync.outbox.v1';

@Injectable({ providedIn: 'root' })
export class OutboxStorage {
  private ready: Promise<void>;

  constructor(
    private storage: IonicStorage,
    private backgroundSync: BackgroundNotesSyncService
  ) {
    this.ready = this.init();
  }

  private async init() {
    await this.storage.create();
    const existing = await this.storage.get(OUTBOX_KEY);
    if (!Array.isArray(existing)) {
      await this.storage.set(OUTBOX_KEY, []);
      await this.backgroundSync.replaceQueue([]);
      return;
    }

    await this.reconcileAndMirror(existing);
  }

  private async read(): Promise<OutboxOp[]> {
    await this.ready;
    const items: OutboxOp[] = (await this.storage.get(OUTBOX_KEY)) ?? [];
    return this.reconcileAndMirror(items);
  }

  private async write(items: OutboxOp[]) {
    await this.ready;
    await this.storage.set(OUTBOX_KEY, items);
    await this.backgroundSync.replaceQueue(items);
  }

  private async reconcileAndMirror(items: OutboxOp[]): Promise<OutboxOp[]> {
    const completedIds = await this.backgroundSync.consumeCompleted();
    const completed = new Set(completedIds);
    const reconciled = completed.size > 0
      ? items.filter((item) => !completed.has(item.opId))
      : items;

    if (reconciled.length !== items.length) {
      await this.storage.set(OUTBOX_KEY, reconciled);
    }

    await this.backgroundSync.replaceQueue(reconciled);
    return reconciled;
  }

  /** Add a new operation to the queue (FIFO). */
  async enqueue(op: OutboxOp) {
    const items = await this.read();
    const existingIndex = items.findIndex((item) => item.opId === op.opId);
    if (existingIndex >= 0) {
      items[existingIndex] = op;
    } else {
      items.push(op);
    }
    await this.write(items);
  }

  /**
   * Read up to `limit` ops that are due (nextAt <= now), without removing them.
   * Use `drop()` to remove after successful processing.
   */
  async peekBatch(limit = 50, now = Date.now()): Promise<OutboxOp[]> {
    const items = await this.read();
    return items.filter(x => (x.nextAt ?? 0) <= now).slice(0, limit);
  }

  /** Remove a set of operations by id (after successful processing). */
  async drop(opIds: string[]) {
    const items = await this.read();
    const next = items.filter(i => !opIds.includes(i.opId));
    await this.write(next);
  }

  /** Replace the entire queue (useful after updating attempts/nextAt). */
  async replace(updated: OutboxOp[]) {
    await this.write(updated);
  }

  /** Introspect the whole queue (debug/metrics). */
  async getAll(): Promise<OutboxOp[]> {
    return this.read();
  }

  /** Optional: clear everything (use with care). */
  async clear(): Promise<void> {
    await this.write([]);
  }
}
