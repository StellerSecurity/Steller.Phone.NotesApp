import { copyTrashedNotes, LocalNote, restorationCleanup, restoreSourceIds, RestoreObservation } from './note-restoration';

describe('Trash restoration', () => {
  const original = (): LocalNote => ({ id: 'original', text: '<p><br></p><p>Æøå 🌍<img src="data:image/png;base64,AQ=="></p><p><br></p>',
    title: 'Full title', protected: true, pinned: true, favorite: true, auto_wipe: true,
    folder_id: 'folder', folder: 'Personal', deleted: true, deleted_at: 10, last_modified: 20, base_version: 20 });
  const copies = () => copyTrashedNotes([original()], ['original'], () => 'restored', () => 21);
  const observed = (version: number, deleted = false, matches = true, stub = false): RestoreObservation => ({ version, deleted, matches, stub });
  it('retains the full original and copies content, locks, images and flags under a new UUID', () => {
    const source = original(), saved = structuredClone(source);
    const { copies: [copy] } = copyTrashedNotes([source], [source.id], () => 'restored', () => 21);
    expect(source).toEqual(saved);
    for (const field of ['title','text','protected','pinned','favorite','auto_wipe','folder_id','folder']) expect((copy as any)[field]).toEqual((source as any)[field]);
    expect(copy.id).not.toBe(source.id); expect(copy.base_version).toBe(0);
    expect(copy.deleted).toBeFalse(); expect(copy.deleted_at).toBeUndefined();
    expect(copy.restore_sources).toEqual([{ id: source.id, version: 20 }]);
  });
  it('makes duplicate restores idempotent and rejects active notes and UUID collisions', () => {
    const one = copies();
    expect(copyTrashedNotes([original(), ...one.copies], ['original','original'], () => 'unused', () => 22).copies).toEqual([]);
    expect(() => copyTrashedNotes([{ ...original(), deleted: false }], ['original'], () => 'new', () => 22)).toThrowError('noteNotDeleted');
    expect(() => copyTrashedNotes([original()], ['original'], () => 'original', () => 22)).toThrowError('noteRestoreIdCollision');
  });
  it('hides source tombstones only while a durable restored copy links to them', () => {
    expect([...restoreSourceIds([original()])]).toEqual([]);
    expect([...restoreSourceIds([original(), ...copies().copies])]).toEqual(['original']);
  });
  it('keeps backups until the published copy and exact deleted source are confirmed', () => {
    const notes = [original(), ...copies().copies];
    for (const map of [new Map<string,RestoreObservation>(), new Map([['restored',observed(21,false,false)]]),
      new Map([['restored',observed(20)],['original',observed(20,true)]]),
      new Map([['restored',observed(21)],['original',observed(20,false)]]),
      new Map([['restored',observed(21)],['original',observed(22,true)]]),
      new Map([['restored',observed(21)],['original',observed(20,true,false)]])]) {
      expect(restorationCleanup(notes, map).retire.size).toBe(0);
      expect(restorationCleanup(notes, map).completed.size).toBe(0);
    }
    const checked = restorationCleanup(notes, new Map([['restored',observed(21)],['original',observed(20,true)]]));
    expect([...checked.retire]).toEqual([['original',20]]); expect(checked.completed.size).toBe(0);
  });
  it('finishes only after the server has finalized the original tombstone', () => {
    const r = restorationCleanup([original(), ...copies().copies], new Map([['restored',observed(21)],['original',observed(22,true,false,true)]]));
    expect([...r.completed]).toEqual(['original']); expect(r.retire.size).toBe(0);
  });
  it('retains all source links across delete and restore before the first copy has synced', () => {
    const first = { ...copies().copies[0], deleted: true, last_modified: 22 };
    const second = copyTrashedNotes([original(), first], ['restored'], () => 'second', () => 23).copies[0];
    expect(second.restore_sources).toEqual([{ id: 'original', version: 20 },{ id: 'restored', version: 22 }]);
    expect([...restoreSourceIds([original(), first, second])]).toEqual(['original','restored']);
  });
});
