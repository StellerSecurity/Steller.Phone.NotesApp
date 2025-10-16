// wipe-app.util.ts
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
// If you use Ionic Storage:
import { Storage } from '@ionic/storage-angular';
// If you use community SQLite:
//// import { CapacitorSQLite } from '@capacitor-community/sqlite';

export async function wipeApp(storage?: Storage, extraIndexedDbNames: string[] = []) {
  // 1) Clear @capacitor/preferences (SharedPreferences / UserDefaults)
  try { await Preferences.clear(); } catch {}

  // 2) Clear Ionic Storage (covers IndexedDB -> LocalStorage fallback)
  try {
    if (storage) {
      await storage.clear();
    }
  } catch {}

  // 3) Clear LocalStorage/SessionStorage (web builds / fallback)
  try { await localStorage.clear(); } catch {}
  try { await sessionStorage.clear(); } catch {}

  // 4) Drop IndexedDB databases (web & some hybrids)
  try {
    // Delete known DBs (add your app DB names here)
    const dbsToDelete = new Set<string>([
      '__ionicstorage',        // default Ionic Storage db
      '__your_app_db__',       // replace if you have one
      ...extraIndexedDbNames,  // e.g. ['__stellar_notes']
    ]);
    // Some browsers support indexedDB.databases(); if not, we still try known names.
    const anyIDB = (indexedDB as any);
    if (anyIDB.databases) {
      const list = await anyIDB.databases();
      for (const db of list) {
        if (db?.name) dbsToDelete.add(db.name);
      }
    }
    for (const name of dbsToDelete) {
      try { indexedDB.deleteDatabase(name); } catch {}
    }
  } catch {}

  // 5) Delete SQLite DBs (if using @capacitor-community/sqlite)
  // try {
  //   await CapacitorSQLite.deleteDatabase({ database: 'yourDbName' });
  // } catch {}

  // 6) Clear app cache/temp files (Capacitor Filesystem)
  try {
    const entries = await Filesystem.readdir({ directory: Directory.Cache, path: '' });
    for (const e of entries.files ?? entries) {
      try {
        await Filesystem.deleteFile({ directory: Directory.Cache, path: e.name ?? e });
      } catch {}
    }
  } catch {}

  // 7) Clear Service Worker caches (PWA)
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}

  // 8) Unregister SW (optional, PWA only)
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {}

  // 9) Any app-specific in-memory singletons/state resets (manually)
  // e.g. authService.signOutLocalOnly(); notesService.reset(); etc.

  // 10) Hard reload the webview/app shell
  try { location.reload(); } catch {}
}
