import { of, throwError } from 'rxjs';
const win = window as any;
const create = win.StellarNotesRuntime.createRuntime;
localStorage.clear();
const signedIn = new URLSearchParams(location.search).has('signed-in');
const storage = new Map<string, any>([['notes.design.preferences.v1', { language: 'en' }]]);
const secure = new Map<string, string>();
const remote = new Map<string, any>();
if (signedIn) {
  secure.set('ssToken', 'a'.repeat(40));
  secure.set('ssEakB64', btoa('x'.repeat(32)));
  secure.set('ssAuthVersion', '1');
  secure.set('ssUser', JSON.stringify({ id: '123', email: 'release-qa@example.invalid', auth_version: 1 }));
}
const localFetch = win.fetch.bind(win);
win.fetch = (request: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url, document.baseURI);
  if (url.origin !== location.origin) throw new Error('External network is disabled in release UI tests.');
  return localFetch(request, init);
};
win.__notesQA = { storage, secure, failSave: false, remote };
const testCreate = async (notify: (snapshot: any) => void) => {
  const runtime = await create(notify, {
    background: false,
    storage: { create: async function () { return this; }, get: async (key: string) => structuredClone(storage.get(key) ?? null), set: async (key: string, value: any) => storage.set(key, structuredClone(value)), remove: async (key: string) => storage.delete(key), clear: async () => storage.clear() },
    secure: { getItem: async (key: string) => secure.get(key) ?? null, setItem: async (key: string, value: string) => secure.set(key, value), removeItem: async (key: string) => secure.delete(key), clear: async () => secure.clear() },
    http: { post(url: string, body: any) {
      if (url.endsWith('/upload')) { for (const note of body.notes) remote.set(note.id, structuredClone(note)); return of({ note_ack_v1: true }); }
      if (url.endsWith('/download')) return of({ notes: [...remote.values()].filter(note => note.deleted || body.known_notes?.[note.id] !== note.last_modified), folders: [] });
      if (url.endsWith('/sync-plan')) return of({});
      return throwError(() => new Error('Unexpected test HTTP request: ' + new URL(url).pathname));
    } }
  });
  const save = runtime.save.bind(runtime);
  runtime.save = async (...args: any[]) => { if (win.__notesQA.failSave) throw new Error('syntheticDiskFull'); return save(...args); };
  win.__notesQA.runtime = runtime;
  await runtime.save([{ id: '61a299ef-a512-4284-a838-2950128e71a2', title: 'Release QA', html: '<p>First line</p><p><br></p><p>Last line</p>', body: 'First line\n\nLast line', locked: false, folder: '', pin: false, star: false }], []);
  return runtime;
};

win.StellarNotesRuntime = { ...win.StellarNotesRuntime, createRuntime: testCreate };
