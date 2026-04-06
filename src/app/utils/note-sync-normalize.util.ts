import { NoteV1 } from '../models/NoteV1';

export function normalizeNoteSyncFlags<T extends Partial<NoteV1>>(note: T | null | undefined): T {
  const source = (note ?? {}) as T;
  return {
    ...source,
    favorite: !!source.favorite,
    pinned: !!source.pinned,
    folder: typeof source.folder === 'string' ? source.folder.trim() : (source.folder ?? ''),
  } as T;
}

export function normalizeNoteSyncFlagsList<T extends Partial<NoteV1>>(notes: ReadonlyArray<T> | null | undefined): T[] {
  if (!Array.isArray(notes)) {
    return [];
  }

  return notes.map((note) => normalizeNoteSyncFlags(note));
}
