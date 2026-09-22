// src/app/services/outbox-storage.service.ts
import { Injectable } from '@angular/core';
import { Storage as IonicStorage } from '@ionic/storage-angular';
import { OutboxOp } from '../models/Sync';
import { BackgroundNotesSyncService } from './background-notes-sync.service';

const OUTBOX_KEY = 'notes.sync.outbox.v1';

@Injectable({ providedIn: 'root' })
export class OutboxStorage {
  private ready: Promise<void>;
  private serial: Promise<unknown> = Promise.resolve();
  private sessionGeneration = 0;
  get generation(): number { return this.sessionGeneration; }

  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const result = this.serial.then(() => this.ready).then(action);
    // A failed storage operation must not poison subsequent attempts.
    this.serial = result.catch(() => undefined);
    return result;
  }

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

    await this.backgroundSync.replaceQueue(await this.reconcile(existing));
  }

  private async read(): Promise<OutboxOp[]> {
    await this.ready;
    const items: OutboxOp[] = (await this.storage.get(OUTBOX_KEY)) ?? [];
    return this.reconcile(items);
  }

  private async write(items: OutboxOp[]) {
    await this.ready;
    await this.storage.set(OUTBOX_KEY, items);
    await this.backgroundSync.replaceQueue(items);
  }

  private async reconcile(items: OutboxOp[]): Promise<OutboxOp[]> {
    const completedIds = await this.backgroundSync.consumeCompleted();
    const completed = new Set(completedIds);
    const reconciled = completed.size > 0
      ? items.filter((item) => !completed.has(item.opId))
      : items;

    if (reconciled.length !== items.length) {
      await this.storage.set(OUTBOX_KEY, reconciled);
    }

    // Native completion already removed these IDs there. Read-only queue polling
    // must not reset native retry state or postpone Android's scheduled worker.
    return reconciled;
  }

  /** Serialize the entire read/modify/persist operation, including native reconciliation. */
  enqueue(op: OutboxOp, generation = this.generation): Promise<void> {
    return this.exclusive(async () => {
      const items = await this.read();
      if (generation !== this.generation) throw new Error('Note session changed');
      const index = items.findIndex(item => item.opId === op.opId);
      if (index >= 0) items[index] = op;
      else items.push(op);
      await this.write(items);
    });
  }

  peekBatch(limit = 50, now = Date.now()): Promise<OutboxOp[]> {
    return this.exclusive(async () => (await this.read())
      .filter(item => !item.conflict && (item.nextAt ?? 0) <= now).slice(0, limit));
  }

  drop(opIds: string[]): Promise<void> {
    return this.exclusive(async () => {
      await this.write((await this.read()).filter(item => !opIds.includes(item.opId)));
    });
  }

  update(opId: string, change: (op: OutboxOp) => OutboxOp): Promise<void> {
    return this.exclusive(async () => {
      await this.write((await this.read()).map(item => item.opId === opId ? change(item) : item));
    });
  }

  retryPending(): Promise<void> {
    return this.exclusive(async () => {
      await this.write((await this.read()).map(item => ({ ...item, attempt: 0, nextAt: 0 })));
    });
  }

  getAll(): Promise<OutboxOp[]> {
    return this.exclusive(() => this.read());
  }

  /** Remove only versions explicitly covered by the user's conflict choice. */
  async discardChosenVersions(versions: Record<string, number>): Promise<void> {
    return this.exclusive(async () => {
      const result: OutboxOp[] = [];
      for (const item of await this.read()) {
        if (item.type !== 'upload') { result.push(item); continue; }
        const notes = item.payload.notes.filter(n => !(n.id in versions) || Number(n.last_modified) > versions[n.id]);
        if (notes.length === item.payload.notes.length) { result.push(item); continue; }
        if (!notes.length && !(item.payload as any).folders?.length && !item.payload.deleted_ids?.length) continue;
        const opId = globalThis.crypto.randomUUID();
        result.push({ ...item, opId, payload: { ...item.payload, op_id: opId, notes } });
      }
      await this.write(result);
    });
  }

  clear(): Promise<void> {
    this.sessionGeneration++;
    return this.exclusive(() => this.write([]));
  }
}
