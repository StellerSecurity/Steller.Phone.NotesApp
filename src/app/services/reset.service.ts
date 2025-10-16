// src/app/services/reset.service.ts
import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Platform } from '@ionic/angular';
import { Storage as IonicStorage } from '@ionic/storage-angular';

import { OutboxStorage } from './outbox-storage.service';

// OPTIONAL: uncomment if you use these
// import { CapacitorSQLite } from '@capacitor-community/sqlite';
// import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

@Injectable({ providedIn: 'root' })
export class ResetService {
  constructor(
    private storage: IonicStorage,
    private platform: Platform,
    private outbox: OutboxStorage,
  ) {}

  /**
   * Wipe all app data we can touch from code, then hard-reload.
   */
  async factoryReset(options?: {
    extraIndexedDbNames?: string[];   // e.g. ['__stellar_notes', '__your_custom_db__']
    sqliteDbNames?: string[];         // if using @capacitor-community/sqlite
    clearSecureStorage?: boolean;     // if using a secure storage plugin
    alsoUnregisterSW?: boolean;       // PWA only
  }) {
    const extraIDBs = new Set(options?.extraIndexedDbNames ?? ['__stellar_notes', '__ionicstorage']);

    // 0) Your app-specific stores (e.g., Outbox)
    try { await this.outbox.clear(); } catch {}

    // 1) Capacitor Preferences
    try { await Preferences.clear(); } catch {}

    // 2) Ionic Storage (covers IndexedDB -> LocalStorage fallback)
    try {
      await this.storage.create();
      await this.storage.clear();
    } catch {}

    // 3) Local/Session storage (webview/PWA)
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}

    // 4) IndexedDB (known names + enumerate when available)
    try {
      const anyIDB = indexedDB as any;
      if (anyIDB?.databases) {
        const list = await anyIDB.databases();
        for (const db of list) {
          if (db?.name) extraIDBs.add(db.name);
        }
      }
      for (const name of extraIDBs) {
        try { indexedDB.deleteDatabase(name); } catch {}
      }
    } catch {}


    // 6) Filesystem cache/temp
    try {
      const entries = await Filesystem.readdir({ directory: Directory.Cache, path: '' });
      const files = (entries as any).files ?? entries; // compat
      for (const f of files) {
        const name = typeof f === 'string' ? f : f.name;
        if (!name) continue;
        try { await Filesystem.deleteFile({ directory: Directory.Cache, path: name }); } catch {}
      }
    } catch {}

    // 7) OPTIONAL: Secure storage (Keychain/Keystore)
    // if (options?.clearSecureStorage) {
    //   try { await SecureStoragePlugin.clear(); } catch {}
    // }

    // 8) OPTIONAL: SQLite DBs
    // if (options?.sqliteDbNames?.length) {
    //   for (const dbName of options.sqliteDbNames) {
    //     try { await CapacitorSQLite.deleteDatabase({ database: dbName }); } catch {}
    //   }
    // }

    // 9) PWA caches (+ optional Service Worker unregister)
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if (options?.alsoUnregisterSW && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch {}

    // 10) Final hard reload
    try { location.reload(); } catch {}
  }
}
