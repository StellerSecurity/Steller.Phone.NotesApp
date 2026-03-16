import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Network } from '@capacitor/network';
import { OutboxStorage } from './outbox-storage.service';

export interface SyncStatusState {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
}

@Injectable({ providedIn: 'root' })
export class SyncStatusService {
  private readonly stateSubject = new BehaviorSubject<SyncStatusState>({
    online: navigator.onLine,
    pendingCount: 0,
    syncing: false,
  });

  readonly state$ = this.stateSubject.asObservable();

  private started = false;
  private pendingRefreshTimer: any = null;

  constructor(private outbox: OutboxStorage) {}

  get snapshot(): SyncStatusState {
    return this.stateSubject.value;
  }

  async init(): Promise<void> {
    if (this.started) {
      await this.refreshPendingCount();
      return;
    }

    this.started = true;

    const status = await Network.getStatus();
    this.patchState({ online: status.connected ?? navigator.onLine });
    await this.refreshPendingCount();

    Network.addListener('networkStatusChange', (statusChange: { connected?: boolean }) => {
      this.patchState({ online: statusChange.connected ?? navigator.onLine });
      void this.refreshPendingCount();
    });

    this.pendingRefreshTimer = setInterval(() => {
      void this.refreshPendingCount();
    }, 3000);
  }

  setSyncing(syncing: boolean): void {
    this.patchState({ syncing });
    if (!syncing) {
      void this.refreshPendingCount();
    }
  }

  async refreshPendingCount(): Promise<void> {
    const items = await this.outbox.getAll();
    this.patchState({ pendingCount: Array.isArray(items) ? items.length : 0 });
  }

  private patchState(patch: Partial<SyncStatusState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...patch,
    });
  }
}
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Network } from '@capacitor/network';
import { OutboxStorage } from './outbox-storage.service';

export interface SyncStatusState {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
}

@Injectable({ providedIn: 'root' })
export class SyncStatusService {
  private readonly stateSubject = new BehaviorSubject<SyncStatusState>({
    online: navigator.onLine,
    pendingCount: 0,
    syncing: false,
  });

  readonly state$ = this.stateSubject.asObservable();

  private started = false;
  private pendingRefreshTimer: any = null;

  constructor(private outbox: OutboxStorage) {}

  get snapshot(): SyncStatusState {
    return this.stateSubject.value;
  }

  async init(): Promise<void> {
    if (this.started) {
      await this.refreshPendingCount();
      return;
    }

    this.started = true;

    const status = await Network.getStatus();
    this.patchState({ online: status.connected ?? navigator.onLine });
    await this.refreshPendingCount();

    Network.addListener('networkStatusChange', (statusChange: { connected?: boolean }) => {
      this.patchState({ online: statusChange.connected ?? navigator.onLine });
      void this.refreshPendingCount();
    });

    this.pendingRefreshTimer = setInterval(() => {
      void this.refreshPendingCount();
    }, 3000);
  }

  setSyncing(syncing: boolean): void {
    this.patchState({ syncing });
    if (!syncing) {
      void this.refreshPendingCount();
    }
  }

  async refreshPendingCount(): Promise<void> {
    const items = await this.outbox.getAll();
    this.patchState({ pendingCount: Array.isArray(items) ? items.length : 0 });
  }

  private patchState(patch: Partial<SyncStatusState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...patch,
    });
  }
}
