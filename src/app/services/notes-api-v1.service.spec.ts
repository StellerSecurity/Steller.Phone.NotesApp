import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { NotesApiV1Service } from './notes-api-v1.service';
import { buildApiUrl, notes } from '../constants/api/product.api';

describe('Notes API persistence', () => {
  let service: NotesApiV1Service;
  let http: any;
  let outbox: any;
  beforeEach(() => {
    http = { post: jasmine.createSpy('post').and.returnValue(of({ notes: [], folders: [] })) };
    outbox = { enqueue: jasmine.createSpy('enqueue').and.resolveTo(), drop: jasmine.createSpy('drop').and.resolveTo() };
    service = new NotesApiV1Service(http, { getItem: async () => null } as any, {} as any, outbox,
      { consumeDownloaded: async () => [] } as any, {} as any);
  });
  it('uses the canonical download route without a double slash', async () => {
    await service.download(0);
    expect(http.post.calls.mostRecent().args[0]).toBe(buildApiUrl(notes.controller) + 'download');
  });
  it('persists an upload before sending and drops it only after acknowledgement', async () => {
    http.post.and.callFake(() => {
      expect(outbox.enqueue).toHaveBeenCalled();
      expect(outbox.drop).not.toHaveBeenCalled();
      return of({});
    });
    await service.upload(0, [], 'test-op');
    expect(http.post.calls.mostRecent().args[0]).toBe(buildApiUrl(notes.controller) + 'upload');
    expect(outbox.drop).toHaveBeenCalledWith(['test-op']);
  });
  it('retains queued uploads when the server fails', async () => {
    http.post.and.returnValue(throwError(() => ({ status: 503 })));
    expect(await service.upload(0, [], 'test-op')).toEqual({ queued: true, reason: 'network_error' });
    expect(outbox.enqueue).toHaveBeenCalled();
    expect(outbox.drop).not.toHaveBeenCalled();
  });
  it('keeps the legacy full-download request unchanged', async () => {
    await service.download(0);
    expect(http.post.calls.mostRecent().args[1]).toEqual({ since: 0, limit: 1000 });
  });
  it('sends optional known versions while accepting an old server full response', async () => {
    http.post.and.returnValue(of({ notes: [{ id: 'old-server', text: 'ciphertext', last_modified: 123 }], folders: [] }));
    const result = await service.download(0, 1000, { 'old-server': 123 });
    expect(http.post.calls.mostRecent().args[1].known_notes).toEqual({ 'old-server': 123 });
    expect(result.notes.length).toBe(1);
    expect(result.notes[0].id).toBe('old-server');
  });
  it('accepts an empty delta without inventing notes', async () => {
    expect((await service.download(0, 1000, { existing: 123 })).notes).toEqual([]);
  });

  it('keeps native downloads when foreground fetching fails', async () => {
    (service as any).backgroundSync = { consumeDownloaded: async () => [
      { notes: [{ id: 'native', text: 'cipher', last_modified: 123 }], folders: [] }
    ] };
    http.post.and.returnValue(throwError(() => ({ status: 503 })));
    expect((await service.download(0)).notes.map(note => note.id)).toEqual(['native']);
  });
  it('still reports a failed download when no background result is available', async () => {
    http.post.and.returnValue(throwError(() => ({ status: 503 })));
    await expectAsync(service.download(0)).toBeRejected();
  });
  it('uses native results offline without an HTTP request', async () => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    (service as any).backgroundSync = { consumeDownloaded: async () => [
      { notes: [{ id: 'offline', text: 'cipher', last_modified: 1 }], folders: [] }
    ] };
    expect((await service.download(0)).notes.length).toBe(1);
    expect(http.post).not.toHaveBeenCalled();
  });
  it('merges native and foreground responses by newest version including tombstones', async () => {
    (service as any).backgroundSync = { consumeDownloaded: async () => [
      { notes: [{ id: 'same', text: 'old', last_modified: 1 }, { id: 'deleted', deleted: true, last_modified: 3 }], folders: [] }
    ] };
    http.post.and.returnValue(of({ notes: [{ id: 'same', text: 'new', last_modified: 2 },
      { id: 'deleted', text: 'stale', last_modified: 2 }], folders: [] }));
    const result = await service.download(0);
    expect(result.notes.find(n => n.id === 'same')!.text).toBe('new');
    expect(result.notes.find(n => n.id === 'deleted')!.deleted).toBeTrue();
  });
  it('times out a hanging upload while retaining the durable operation', fakeAsync(() => {
    http.post.and.returnValue(NEVER);
    let result: any;
    service.upload(0, [], 'timeout').then(value => result = value);
    flushMicrotasks();
    tick(15001);
    flushMicrotasks();
    expect(result.queued).toBeTrue();
    expect(outbox.drop).not.toHaveBeenCalled();
  }));
  it('times out a hanging delete while retaining the durable operation', fakeAsync(() => {
    http.post.and.returnValue(NEVER);
    let result: any;
    service.deleteNotes(['deleted']).then(value => result = value);
    flushMicrotasks();
    tick(15001);
    flushMicrotasks();
    expect(result?.queued).toBeTrue();
    expect(outbox.drop).not.toHaveBeenCalled();
  }));

});
