import { NotesStorageService } from './notes-storage.service';

describe('Durable local writes', () => {
  let storage: any;
  let service: NotesStorageService;
  beforeEach(async () => {
    spyOn(localStorage, 'setItem');
    spyOn(localStorage, 'removeItem');
    storage = { create: async () => {}, get: async (key: string) => key === 'storage_migration_version' ? '1' : null,
      set: jasmine.createSpy('set').and.resolveTo(), remove: jasmine.createSpy('remove').and.resolveTo() };
    service = new NotesStorageService(storage);
    await service.init();
  });
  it('remembers an earlier disk error when flush runs later', async () => {
    storage.set.and.rejectWith(new Error('disk full'));
    service.setNotesRaw('unsaved');
    await expectAsync(service.flush()).toBeRejected();
    await expectAsync(service.flush()).toBeRejected();
    expect(service.hasStorageError$.value).toBeTrue();
    expect(service.getNotesRaw()).toBe('unsaved');
  });
  it('retries the latest value and clears the error only after persistence', async () => {
    storage.set.and.rejectWith(new Error('disk full'));
    service.setNotesRaw('first');
    await expectAsync(service.flush()).toBeRejected();
    service.setNotesRaw('latest');
    await expectAsync(service.flush()).toBeRejected();
    storage.set.and.resolveTo();
    await service.retryFailedWrites();
    expect(storage.set.calls.mostRecent().args).toEqual(['notes', 'latest']);
    expect(service.hasStorageError$.value).toBeFalse();
  });
  it('serializes writes so a slow older save cannot overwrite a newer one', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    storage.set.and.callFake(async (_key: string, value: string) => { if (value === 'old') await gate; });
    service.setNotesRaw('old');
    service.setNotesRaw('new');
    await Promise.resolve(); await Promise.resolve();
    expect(storage.set.calls.allArgs().some((args: any[]) => args[1] === 'new')).toBeFalse();
    release();
    await service.flush();
    expect(storage.set.calls.allArgs()).toEqual([['notes', 'old'], ['notes', 'new']]);
  });
  it('does not let a successful write to another key hide a failure', async () => {
    storage.set.and.callFake(async (key: string) => { if (key === 'notes') throw new Error('disk'); });
    service.setNotesRaw('note'); service.setFoldersRaw('folder');
    await expectAsync(service.flush()).toBeRejected();
    expect(service.hasStorageError$.value).toBeTrue();
  });
});


describe('IndexedDB stress with an isolated test database', () => {
  it('persists 1000 rapid snapshots and restores the final 1 MB note collection', async () => {
    const { Storage, Drivers } = await import('@ionic/storage');
    const name = 'stellar-stress-' + Date.now();
    const disk = new Storage({ name, driverOrder: [Drivers.IndexedDB] });
    await disk.create();
    expect(disk.driver).toBe(Drivers.IndexedDB);
    await disk.set('storage_migration_version', '1');
    spyOn(localStorage, 'setItem');
    spyOn(localStorage, 'removeItem');
    const service = new NotesStorageService(disk as any);
    await service.init();
    const started = performance.now();
    try {
      for (let i = 0; i < 1000; i++) service.setNotesRaw(JSON.stringify([{ id: 'rapid', version: i, text: 'æøå😀\n'.repeat(200) }]));
      await service.flush();
      expect(JSON.parse(await disk.get('notes'))[0].version).toBe(999);
      const large = JSON.stringify(Array.from({length: 1000}, (_, i) => ({id: String(i), text: 'x'.repeat(1024)})));
      service.setNotesRaw(large);
      await service.flush();
      const reopened = new NotesStorageService(new Storage({ name, driverOrder: [Drivers.IndexedDB] }) as any);
      await reopened.init();
      expect(reopened.getNotesRaw()).toBe(large);
      expect(service.hasStorageError$.value).toBeFalse();
      console.log('STRESS IndexedDB 1000 writes + 1000-note reopen ms:', Math.round(performance.now() - started));
    } finally { await disk.clear(); }
  }, 60000);
});
