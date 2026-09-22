import { encryptTextWithMK, packCipherBlob } from '@stellarsecurity/stellar-crypto';
import { HomePage } from './home.page';

describe('Mobile metadata save ordering', () => {
  function fixture() {
    const page: any = Object.create(HomePage.prototype);
    let saved = '[]';
    const uploads: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    page.notes = [{ id: 'qa', text: '<p>keep</p>', favorite: false, pinned: false, last_modified: 1 }];
    page.filteredResults = page.notes;
    page.authService = { isLoggedIn: true };
    page.notesSyncTail = Promise.resolve();
    page.appHaptics = { selectionChanged: async () => {} };
    page.refreshVisibleNotes = () => {};
    page.getStoredFolders = () => [];
    page.noteService = {
      markPendingMutation: () => {}, hasAnyPendingMutation: () => true,
      appHasPasswordChallenge: () => false, getNotesAppPassword: () => '',
      setNotes: (raw: string) => { saved = raw; }, setDecryptedNotes: () => {},
      flushPersistence: async () => {}, syncNeedsAttention$: { next: jasmine.createSpy('attention') },
    };
    page.notesApiServiceV1 = { upload: jasmine.createSpy('upload').and.callFake(() => new Promise<void>((resolve, reject) => uploads.push({ resolve, reject }))) };
    page.syncWorker = { trySync: async () => {} };
    const present = jasmine.createSpy('present').and.resolveTo();
    page.toastController = { create: async () => ({ present }) };
    return { page, uploads, present, read: () => JSON.parse(saved) };
  }

  it('keeps the newest local flag while serializing slow encryption in tap order', async () => {
    const f = fixture(); const event = { stopPropagation: () => {}, preventDefault: () => {} } as Event;
    const first = f.page.toggleFavoriteFromHome(event, 'qa');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const second = f.page.toggleFavoriteFromHome(event, 'qa');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(f.read()[0].favorite).toBeFalse();
    expect(f.uploads.length).toBe(1);
    f.uploads[0].resolve(); await first;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    f.uploads[1].resolve(); await second;
    const sent = f.page.notesApiServiceV1.upload.calls.allArgs().map((args: any[]) => args[1][0]);
    expect(sent.map((note: any) => note.favorite)).toEqual([true, false]);
    expect(sent[1].last_modified).toBeGreaterThan(sent[0].last_modified);
    expect(f.read()[0].favorite).toBeFalse();
    expect(f.read()[0].text).toBe('<p>keep</p>');
  });

  it('retains a local flag and reports a failed queue write', async () => {
    const f = fixture(); const event = { stopPropagation: () => {}, preventDefault: () => {} } as Event;
    const saving = f.page.togglePinnedFromHome(event, 'qa');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    f.uploads[0].reject(new Error('Synthetic storage failure'));
    await expectAsync(saving).toBeResolved();
    expect(f.read()[0]?.pinned).toBeTrue();
    expect(f.page.noteService.syncNeedsAttention$.next).toHaveBeenCalledWith(true);
    expect(f.present).toHaveBeenCalled();
  });
});

describe('Incremental home synchronization', () => {
  function pageFor(response: any) {
    const page: any = Object.create(HomePage.prototype);
    page.authService = { isLoggedIn: true };
    page.pauseSync = false;
    page.syncTimer = 1; // Do not start a live timer in the test.
    page.notes = [
      { id: 'saved', text: 'local text', folder_id: 'folder', folder: 'Before', last_modified: 100 },
      { id: 'pending', text: 'unsent text', last_modified: 200 },
    ];
    page.outbox = { getAll: async () => [] };
    page.notesApiServiceV1 = { download: jasmine.createSpy('download').and.resolveTo(response) };
    page.noteService = {
      hasAnyPendingMutation: (id: string) => id === 'pending',
      getNotesAppPassword: () => '',
      appHasPasswordChallenge: () => false,
      setNotes: jasmine.createSpy('setNotes'),
      setFolders: jasmine.createSpy('setFolders'),
      flushPersistence: async () => {},
      reconcileServerConfirmation: jasmine.createSpy('confirm'),
    };
    page.decryptServerFolders = async () => new Map([['folder', 'After']]);
    page.getStoredFolders = () => [{ id: 'folder', name: 'Before', last_modified: 1 }];
    page.refreshVisibleNotes = () => {};
    page.setData = () => {};
    page.refreshHomeNoticeCards = async () => {};
    page.dataService = { setForceDownloadOnHome: () => {} };
    page.trackSyncFailed = jasmine.createSpy('failure');
    return page;
  }

  it('keeps local notes on an empty delta and excludes unconfirmed edits from the manifest', async () => {
    const page = pageFor({ notes: [], folders: [] });
    await page.syncFromServer({ silent: true });
    expect(page.notesApiServiceV1.download).toHaveBeenCalledWith(0, 1000, { saved: 100 });
    expect(page.notes.map((n: any) => n.id)).toEqual(['saved', 'pending']);
    expect(page.trackSyncFailed).not.toHaveBeenCalled();
  });

  it('applies folder renames without downloading unchanged note bodies', async () => {
    const page = pageFor({ notes: [], folders: [{ id: 'folder', name: 'After', last_modified: 2 }] });
    await page.syncFromServer({ silent: true });
    expect(page.notes[0].text).toBe('local text');
    expect(page.notes[0].folder).toBe('After');
    expect(JSON.parse(page.noteService.setNotes.calls.mostRecent().args[0])[0].folder).toBe('After');
    expect(page.trackSyncFailed).not.toHaveBeenCalled();
  });

  it('applies tombstones while preserving other locally cached notes', async () => {
    const page = pageFor({ notes: [{ id: 'saved', deleted: true, last_modified: 101 }], folders: [] });
    await page.syncFromServer({ silent: true });
    expect(page.notes.map((n: any) => n.id)).toEqual(['pending']);
    expect(page.trackSyncFailed).not.toHaveBeenCalled();
  });

  it('prevents overlapping downloads', async () => {
    const page = pageFor({ notes: [], folders: [] });
    await Promise.all([page.syncFromServer(), page.syncFromServer()]);
    expect(page.notesApiServiceV1.download).toHaveBeenCalledTimes(1);
  });

  it('coalesces realtime hints during an older download into one immediate follow-up', async () => {
    const page = pageFor({ notes: [], folders: [] });
    let release!: (value: any) => void;
    const first = new Promise(resolve => release = resolve);
    page.notesApiServiceV1.download.and.returnValues(first, Promise.resolve({ notes: [], folders: [] }));
    const running = page.syncFromServer({ silent: true });
    for (let i=0; i<20; i++) await page.syncFromServer({ silent: true, realtime: true });
    expect(page.notesApiServiceV1.download).toHaveBeenCalledTimes(1);
    release({ notes: [], folders: [] }); await running;
    expect(page.notesApiServiceV1.download).toHaveBeenCalledTimes(2);
    expect(page.trackSyncFailed).not.toHaveBeenCalled();
  });

  it('does not run a deferred realtime download after logout', async () => {
    const page = pageFor({ notes: [], folders: [] });
    let release!: (value: any) => void;
    page.notesApiServiceV1.download.and.returnValue(new Promise(resolve => release = resolve));
    const running = page.syncFromServer({ silent: true });
    await page.syncFromServer({ silent: true, realtime: true }); page.authService.isLoggedIn=false;
    release({ notes: [], folders: [] }); await running;
    expect(page.notesApiServiceV1.download).toHaveBeenCalledTimes(1);
    expect(page.noteService.setNotes).not.toHaveBeenCalled();
  });

  it('applies desktop favorite and pin changes, including false, without changing note text', async () => {
    const key=new Uint8Array(32).fill(3);
    const text=packCipherBlob(await encryptTextWithMK(key,'test\ntest\ntest','saved'));
    const title=packCipherBlob(await encryptTextWithMK(key,'Shared note','saved#title'));
    const page=pageFor({notes:[],folders:[]});page.mkRaw=key;
    page.noteService.shouldIgnoreServerNote=()=>false;
    for (const [favorite,pinned] of [[true,false],[true,true],[false,true],[false,false]]) {
      const version=Number(page.notes.find((n:any)=>n.id==='saved').last_modified)+1;
      page.notesApiServiceV1.download.and.resolveTo({notes:[{id:'saved',title,text,last_modified:version,favorite,pinned,auto_wipe:false}],folders:[]});
      await page.syncFromServer({silent:true,realtime:true});
      const saved=page.notes.find((n:any)=>n.id==='saved');
      expect(saved.favorite).toBe(favorite);expect(saved.pinned).toBe(pinned);
      expect(saved.text).toBe('test\ntest\ntest');expect(saved.title).toBe('Shared note');
      expect(saved.auto_wipe).toBeFalse();expect(page.trackSyncFailed).not.toHaveBeenCalled();
    }
  });
  it('keeps a queued local edit even when the server clock is ahead', async () => {
    const page = pageFor({ notes: [{ id: 'saved', deleted: true, last_modified: 999999 }], folders: [] });
    page.outbox = { getAll: async () => [{ type: 'upload', payload: { notes: [{ id: 'saved' }] } }] };
    await page.syncFromServer();
    expect(page.notes[0].text).toBe('local text');
    expect(page.noteService.reconcileServerConfirmation).not.toHaveBeenCalled();
  });
  it('isolates a corrupt note while decrypting and saving healthy notes', async () => {
    const key = new Uint8Array(32).fill(3);
    const healthy = packCipherBlob(await encryptTextWithMK(key, 'healthy text', 'healthy'));
    const page = pageFor({ notes: [{ id: 'saved', text: 'broken', last_modified: 999 },
      { id: 'healthy', text: healthy, title: '', last_modified: 200 }], folders: [] });
    page.mkRaw = key;
    page.noteService.shouldIgnoreServerNote = () => false;
    const present = jasmine.createSpy('present').and.resolveTo();
    page.toastController = { create: async () => ({ present }) };
    await page.syncFromServer();
    expect(page.notes.find((n: any) => n.id === 'saved').text).toBe('local text');
    expect(page.notes.find((n: any) => n.id === 'healthy').text).toBe('healthy text');
    expect(present).toHaveBeenCalled();
    expect(page.trackSyncFailed).not.toHaveBeenCalled();
  });

});


describe('Favorites pager restoration', () => {
  it('positions Favorites correctly even while the pager DOM is absent after an empty search', () => {
    const page: any = Object.create(HomePage.prototype);
    page.activeFilter = 'favorites';
    page.pagerWidth = 0;
    page.pagerShell = undefined;
    page.updatePagerTransform();
    expect(page.pagerTransform).toBe('translate3d(calc(-100% + 0px), 0, 0)');
    page.pagerWidth = 661; // Cached width must not override a later viewport resize.
    page.updatePagerTransform(40);
    expect(page.pagerTransform).toBe('translate3d(calc(-100% + 40px), 0, 0)');
    page.activeFilter = 'all';
    page.updatePagerTransform();
    expect(page.pagerTransform).toBe('translate3d(calc(0% + 0px), 0, 0)');
  });
});
