import { Drivers, Storage } from '@ionic/storage';

type Database = Storage;
type Factory = (name: string) => Database;
const JOURNAL = 'notes.design.database-import.v1';
const empty = (value: unknown) => value == null || value === '' || value === '[]' || value === '{}'
  || Array.isArray(value) && value.length === 0;
const hasData = (entries: [string, any][]) => entries.some(([key, value]) =>
  key !== 'storage_migration_version' && key !== JOURNAL &&
  (key === 'app_password_challenge' ? value != null : !empty(value)));
const entries = async (db: Database): Promise<[string, any][]> => Promise.all(
  (await db.keys()).filter(key => key !== JOURNAL).sort().map(async key => [key, await db.get(key)] as [string, any]),
);
async function fingerprint(value: [string, any][]): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function openNotesDatabase(factory: Factory = name => new Storage({
  name, driverOrder: [Drivers.IndexedDB, Drivers.LocalStorage],
}), legacy: Pick<globalThis.Storage, 'getItem'> = localStorage): Promise<Database> {
  const canonical = factory('__stellar_notes');
  await canonical.create();
  const journal = await canonical.get(JOURNAL);
  if (journal?.version === 1 && journal.state === 'complete') return canonical;

  // Published Ionic versions already use this database. Import only the
  // separate database used by the early design preview; leave its copy intact.
  const preview = factory('stellar-notes-design');
  await preview.create();
  const source = await entries(preview);
  if (!hasData(source)) {
    if (journal) throw new Error('notesStorageImportIncomplete');
    return canonical;
  }
  const digest = await fingerprint(source);
  if (journal) {
    if (journal.version !== 1 || journal.state !== 'copying' || journal.fingerprint !== digest) throw new Error('notesStorageImportConflict');
  } else {
    let raw: [string, any][];
    try { raw = ['notes', 'folders', 'app_password_challenge'].map(key => [key, legacy.getItem(key)]); }
    catch { throw new Error('notesStorageUnavailable'); }
    const sourceValues = new Map(source);
    const conflictingRaw = raw.some(([key, value]) =>
      (key === 'app_password_challenge' ? value != null : !empty(value)) && value !== sourceValues.get(key));
    if (hasData(await entries(canonical)) || conflictingRaw) throw new Error('notesStorageImportConflict');
    await canonical.set(JOURNAL, { version: 1, state: 'copying', fingerprint: digest });
  }
  for (const [key, value] of source) {
    await canonical.set(key, value);
    if (JSON.stringify(await canonical.get(key)) !== JSON.stringify(value)) throw new Error('notesStorageImportIncomplete');
  }
  if (await fingerprint(await entries(preview)) !== digest) throw new Error('notesStorageImportConflict');
  await canonical.set(JOURNAL, { version: 1, state: 'complete', fingerprint: digest });
  return canonical;
}
