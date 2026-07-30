import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BackgroundNotesSync as NativeBackgroundNotesSync } from '@stellar/background-notes-sync';
import { OutboxOp } from '../models/Sync';
import { buildApiUrl, notes } from '../constants/api/product.api';

@Injectable({ providedIn: 'root' })
export class BackgroundNotesSyncService {
  private readonly uploadUrl = `${buildApiUrl(notes.controller)}${notes.upload}`;
  private readonly syncPlanUrl = `${buildApiUrl(notes.controller)}${notes.syncPlan}`;
  private readonly downloadUrl = `${buildApiUrl(notes.controller)}download`;

  constructor() {
    void this.configurePull();
  }

  async configurePull(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await NativeBackgroundNotesSync.configurePull({ downloadUrl: this.downloadUrl });
    } catch (error) {
      console.warn('Unable to configure background note downloads', error);
    }
  }

  async consumeDownloaded(): Promise<Array<Record<string, any>>> {
    if (!Capacitor.isNativePlatform()) return [];
    try {
      const result = await NativeBackgroundNotesSync.consumeDownloaded();
      return Array.isArray(result?.responses) ? result.responses : [];
    } catch (error) {
      console.warn('Unable to read background note downloads', error);
      return [];
    }
  }

  async clearDownloaded(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await NativeBackgroundNotesSync.clearDownloaded();
    } catch (error) {
      console.warn('Unable to clear background note downloads', error);
    }
  }

  async replaceQueue(operations: OutboxOp[]): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await NativeBackgroundNotesSync.replaceQueue({
        operations,
        uploadUrl: this.uploadUrl,
        syncPlanUrl: this.syncPlanUrl,
      });
    } catch (error) {
      // Keep the web outbox authoritative if the native bridge is unavailable.
      console.warn('Unable to mirror notes outbox to native background sync', error);
    }
  }

  async consumeCompleted(): Promise<string[]> {
    if (!Capacitor.isNativePlatform()) {
      return [];
    }

    try {
      const result = await NativeBackgroundNotesSync.consumeCompleted();
      return Array.isArray(result?.opIds) ? result.opIds : [];
    } catch (error) {
      console.warn('Unable to reconcile native background sync results', error);
      return [];
    }
  }
}
