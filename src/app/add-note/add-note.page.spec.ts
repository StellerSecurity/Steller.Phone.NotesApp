import { AddNotePage } from './add-note.page';

const formattedHtml =
  '<h2>Heading</h2><p><br></p><ol><li><strong>Bold</strong> 👋🏽</li></ol><p><br></p>';

function persistenceHarness(isLoggedIn: boolean): any {
  const page: any = Object.create(AddNotePage.prototype);
  page.saveTimeout = null;
  page.notes = [{ id: 'note-1', text: formattedHtml, title: 'Fixture', last_modified: 42 }];
  page.notesService = {
    appHasPasswordChallenge: () => false,
    setNotes: jasmine.createSpy('setNotes'),
    setDecryptedNotes: jasmine.createSpy('setDecryptedNotes'),
    flushPersistence: jasmine.createSpy('flushPersistence').and.resolveTo(),
  };
  page.markSnapshotSaved = jasmine.createSpy('markSnapshotSaved');
  page.dataService = { setForceDownloadOnHome: jasmine.createSpy('setForceDownloadOnHome') };
  page.getStoredFolders = () => [];
  page.authService = { isLoggedIn };
  page.notesApiV1Service = {
    upload: jasmine.createSpy('upload').and.resolveTo({ ok: true }),
  };
  return page;
}

describe('AddNotePage formatting persistence', () => {
  it('flushes the local snapshot before relocking on background', async () => {
    const page: any = Object.create(AddNotePage.prototype);
    const order: string[] = [];
    page.forceSaveNow = jasmine.createSpy('forceSaveNow').and.callFake(async (immediate: boolean) => {
      expect(immediate).toBeTrue();
      order.push('save');
    });
    page.relockProtectedNote = jasmine.createSpy('relockProtectedNote').and.callFake(() => order.push('relock'));

    await page.flushAutosaveBeforeBackground();

    expect(order).toEqual(['save', 'relock']);
  });

  it('waits for persistence before navigating back', async () => {
    const page: any = Object.create(AddNotePage.prototype);
    const order: string[] = [];
    page.forceSaveNow = jasmine.createSpy('forceSaveNow')
      .and.callFake(async () => order.push('save'));
    page.relockProtectedNote = jasmine.createSpy('relockProtectedNote')
      .and.callFake(() => order.push('relock'));
    page.navController = {
      back: jasmine.createSpy('back').and.callFake(() => order.push('navigate')),
    };

    await page.back();

    expect(page.forceSaveNow).toHaveBeenCalledOnceWith(false);
    expect(order).toEqual(['save', 'relock', 'navigate']);
  });

  it('preserves formatted HTML in local-only mode without requiring Stellar ID', async () => {
    const page = persistenceHarness(false);

    await page.storeNoteInStorage(true, false, true);

    const serialized = page.notesService.setNotes.calls.mostRecent().args[0];
    expect(JSON.parse(serialized)[0].text).toBe(formattedHtml);
    expect(page.notesApiV1Service.upload).not.toHaveBeenCalled();
  });

  it('persists the same formatted HTML before signed-in sync upload', async () => {
    const page = persistenceHarness(true);

    await page.storeNoteInStorage(true, false, true);

    const uploadedNotes = page.notesApiV1Service.upload.calls.mostRecent().args[1];
    expect(uploadedNotes[0].text).toBe(formattedHtml);
    expect(page.notesService.flushPersistence).toHaveBeenCalledBefore(page.notesApiV1Service.upload);
  });
});
