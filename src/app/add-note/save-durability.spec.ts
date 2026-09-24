import { AddNotePage } from './add-note.page';

describe('Editor durable queue ordering', () => {
  function newNote(html: string) {
    const page: any = Object.create(AddNotePage.prototype);
    Object.assign(page, {
      newlyCreatedNote: true, note_title: '', note_text: html,
      getUntitledLabel: () => 'Untitled', hasMeaningfulChanges: () => true,
      save: jasmine.createSpy('save'),
    });
    return page;
  }
  for (const src of ['data:image/png;base64,AA==', 'https://example.com/photo.png']) {
    it('saves a new image-only note on leave: ' + src.split(':')[0], () => {
      const page = newNote('<p><img src="' + src + '"></p>');
      page.forceSaveNow();
      expect(page.save).toHaveBeenCalledWith(null);
    });
  }
  for (const html of ['', '<p><br></p>', '<p> &nbsp; </p>', '<p><img src=""></p>']) {
    it('still skips a truly empty new note: ' + html, () => {
      const page = newNote(html);
      page.forceSaveNow();
      expect(page.save).not.toHaveBeenCalled();
    });
  }
  function pageFor(upload: any) {
    const page: any = Object.create(AddNotePage.prototype);
    Object.assign(page, {
      saveInProgress: Promise.resolve(), notes: [{ id: 'a', text: 'new', last_modified: 100 }], notes_id: 'a',
      getStoredFolders: () => [], authService: { isLoggedIn: true }, notesApiV1Service: { upload },
      notesService: { setNotes: jasmine.createSpy('local'), setDecryptedNotes: () => {}, flushPersistence: async () => {}, appHasPasswordChallenge: () => false },
      markSnapshotSaved: jasmine.createSpy('saved'), liveNoteTimer: 1,
      toastController: { create: async () => ({ present: async () => {} }) },
    });
    return page;
  }
  it('does not mark saved or start the network timer before enqueue completes', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    const upload = jasmine.createSpy('queue').and.returnValue(gate);
    const timer = spyOn(window, 'setTimeout').and.returnValue(1);
    const page = pageFor(upload);
    const run = page.storeNoteInStorage();
    await Promise.resolve();
    expect(upload.calls.mostRecent().args[4]).toBeTrue();
    expect(page.markSnapshotSaved).not.toHaveBeenCalled();
    expect(timer).not.toHaveBeenCalled();
    release(); await run;
    expect(page.markSnapshotSaved).toHaveBeenCalled();
    expect(timer).toHaveBeenCalled();
  });
  it('does not report saved if the durable queue fails', async () => {
    const page = pageFor(async () => { throw new Error('disk full'); });
    await page.storeNoteInStorage();
    expect(page.markSnapshotSaved).not.toHaveBeenCalled();
    expect(page.notesService.setNotes).not.toHaveBeenCalled();
  });
  it('does not mark text typed during an asynchronous save as already saved', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    spyOn(window, 'setTimeout').and.returnValue(1);
    const page = pageFor(() => gate);
    page.note_text = 'saved text';
    const run = page.storeNoteInStorage();
    await Promise.resolve();
    page.note_text = 'new text still waiting for debounce';
    release(); await run;
    expect(page.markSnapshotSaved).not.toHaveBeenCalled();
  });

});
