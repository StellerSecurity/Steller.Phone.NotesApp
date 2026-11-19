import { NoteV1 } from '../app/models/NoteV1';

export interface RestoreSource { id: string; version: number; }
export type LocalNote = NoteV1 & { sync_pending?: boolean; restore_sources?: RestoreSource[] };
export interface RestoreObservation { version: number; deleted: boolean; matches: boolean; stub: boolean; }

export function restoreSourceIds(notes: LocalNote[]): Set<string> {
  const ids = new Set<string>();
  for (const note of notes) for (const source of note.restore_sources || []) ids.add(source.id);
  return ids;
}

export function copyTrashedNotes(notes: LocalNote[], ids: string[], newId: () => string, nextVersion: () => number) {
  const copies: LocalNote[] = [], restoredIds: string[] = [];
  for (const id of new Set(ids)) {
    const existing = [...notes, ...copies].find(note => note.restore_sources?.some(source => source.id === id));
    if (existing) { restoredIds.push(existing.id); continue; }
    const source = notes.find(note => note.id === id);
    if (!source?.deleted) throw new Error('noteNotDeleted');
    const copyId = newId();
    if ([...notes, ...copies].some(note => note.id === copyId)) throw new Error('noteRestoreIdCollision');
    const sources = new Map((source.restore_sources || []).map(item => [item.id, item]));
    sources.set(id, { id, version: Number(source.last_modified || 0) });
    copies.push({ ...source, id: copyId, base_version: 0, checksum_hmac: undefined,
      deleted: false, deleted_at: undefined, last_modified: nextVersion(), sync_pending: true,
      restore_sources: [...sources.values()] });
    restoredIds.push(copyId);
  }
  return { copies, restoredIds };
}

export function restorationCleanup(notes: LocalNote[], observations: Map<string, RestoreObservation>) {
  const retire = new Map<string, number>(), completed = new Set<string>();
  for (const copy of notes) {
    const confirmed = observations.get(copy.id);
    if (!copy.restore_sources?.length || !confirmed?.matches || confirmed.stub
      || confirmed.version !== Number(copy.last_modified)) continue;
    for (const source of copy.restore_sources) {
      const original = observations.get(source.id);
      if (original?.stub) completed.add(source.id);
      else if (original?.deleted && original.matches && original.version === source.version) retire.set(source.id, source.version);
    }
  }
  return { retire, completed };
}
