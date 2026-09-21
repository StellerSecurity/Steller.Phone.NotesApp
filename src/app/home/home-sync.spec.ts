import { encryptTextWithMK, packCipherBlob } from '@stellarsecurity/stellar-crypto';
import { HomePage } from './home.page';

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
