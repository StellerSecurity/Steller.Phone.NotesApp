describe('Shipping Notes UI with the actual runtime and Quill', () => {
  let previousTimeout: number;
  beforeAll(() => { previousTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL; jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000; });
  afterAll(() => { jasmine.DEFAULT_TIMEOUT_INTERVAL = previousTimeout; });
  let frame: HTMLIFrameElement;
  let win: any;
  let doc: Document;
  const wait = async (condition: () => unknown) => {
    const end = Date.now() + 10000;
    while (!condition()) { if (Date.now() > end) throw new Error('Timed out waiting for UI state: ' + JSON.stringify({ ready: !!win?.__notesQA?.runtime, inert: doc?.getElementById('app')?.inert, text: doc?.body.textContent?.slice(0, 500) })); await new Promise(resolve => setTimeout(resolve, 20)); }
  };
  const get = (selector: string) => { const element = doc.querySelector(selector) as HTMLElement; if (!element) throw new Error('Missing UI: ' + selector); return element; };
  const click = (selector: string) => get(selector).click();
  const input = (selector: string, value: string) => { const element = get(selector) as HTMLInputElement; element.value = value; element.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const list = () => !!doc.querySelector('[data-action="new"]');
  const editor = () => !!doc.querySelector('.ql-editor');
  const open = async () => { click('[data-note]'); await wait(editor); };
  const body = () => get('.ql-editor').textContent || '';
  const title = () => (get('.title-input') as HTMLInputElement).value;
  const replaceBody = (value: string) => {
    const quill = win.StellarNoteEditorEngine.Quill.find(get('.note-quill-host'));
    quill.setText(value, 'user');
  };
  const start = async (signedIn = false) => {
    frame = document.createElement('iframe'); frame.style.cssText = 'width:390px;height:844px';
    frame.src = '/base/local/release-ui/index.html' + (signedIn ? '?signed-in=1' : ''); document.body.appendChild(frame);
    await new Promise<void>((resolve, reject) => { frame.onload = () => resolve(); frame.onerror = () => reject(new Error('UI fixture did not load')); });
    win = frame.contentWindow; doc = frame.contentDocument!; await wait(() => !!win.__notesQA?.runtime && list() && !doc.getElementById('app')?.inert);
  };
  afterEach(() => { win?.__notesQA?.runtime?.dispose(); frame?.remove(); });
  it('saves rapid ordinary edits on Back and preserves intentional empty lines', async () => {
    await start(); await open(); replaceBody('\nLeading\n\nEmoji 🧪 æøå\n\nLast\n\n'); click('[data-action="back"]'); await wait(list); await open();
    expect(Array.from(doc.querySelectorAll('.ql-editor p')).map(p => p.textContent)).toEqual(['', 'Leading', '', 'Emoji 🧪 æøå', '', 'Last', '']);
  });
  it('saves protected edits before relocking on immediate Back', async () => {
    await start(); await open(); click('[data-action="note-lock"]'); input('#modal input', 'Synthetic92!'); click('#lock-now'); await wait(() => !!doc.querySelector('[data-action="unlock-note"]'));
    click('[data-action="unlock-note"]'); input('#modal input', 'Synthetic92!'); click('#unlock-confirm'); await wait(editor);
    replaceBody('Protected last edit\n\nRetained blank'); click('[data-action="back"]'); await wait(list);
    expect(get('.note-list').textContent).not.toContain('Release QA'); click('[data-note]'); click('[data-action="unlock-note"]'); input('#modal input', 'Synthetic92!'); click('#unlock-confirm'); await wait(editor);
    expect(body()).toContain('Protected last edit'); expect(Array.from(doc.querySelectorAll('.ql-editor p')).map(p => p.textContent)).toEqual(['Protected last edit', '', 'Retained blank']);
  });
  it('keeps an unsaved editor open on storage failure and allows a successful retry', async () => {
    await start(); await open(); replaceBody('Draft survives storage error'); win.__notesQA.failSave = true; click('[data-action="back"]');
    await wait(() => !get('[data-action="back"]').hasAttribute('aria-busy')); expect(editor()).toBeTrue(); expect(body()).toContain('Draft survives storage error'); expect(get('#app').inert).toBeFalse();
    win.__notesQA.failSave = false; click('[data-action="back"]'); await wait(list); await open(); expect(body()).toContain('Draft survives storage error');
  });
  it('places wrong-password feedback below the field and recovers on a correct retry', async () => {
    await start(); await open(); click('[data-action="note-lock"]'); input('#modal input', 'Synthetic92!'); click('#lock-now'); await wait(() => !!doc.querySelector('[data-action="unlock-note"]'));
    click('[data-action="unlock-note"]'); input('#modal input', 'wrong'); click('#unlock-confirm'); await wait(() => !get('#note-password-error').hidden);
    expect(get('#modal input').getBoundingClientRect().bottom).toBeLessThanOrEqual(get('#note-password-error').getBoundingClientRect().top);
    expect(get('#toast').classList.contains('visible')).toBeFalse(); input('#modal input', 'Synthetic92!'); expect(get('#note-password-error').hidden).toBeTrue(); click('#unlock-confirm'); await wait(editor); expect(title()).toBe('Release QA');
  });
  it('cancels deletion without losing text, then restores a trashed note intact', async () => {
    await start(); await open(); click('[data-action="more"]'); click('[data-menu="delete"]'); click('#modal [data-close]'); await wait(editor); expect(editor()).toBeTrue(); expect(body()).toContain('Last line');
    click('[data-action="more"]'); click('[data-menu="delete"]'); click('#confirm'); await wait(list); await wait(() => win.__notesQA.runtime.snapshot().notes[0].deleted); expect(win.__notesQA.runtime.snapshot().notes[0].deleted).toBeTrue();
    click('[data-page="folders"]'); click('[data-action="trash"]'); click('[data-note]'); click('[data-action="restore"]'); await wait(() => win.__notesQA.runtime.snapshot().notes.some((note: any) => !note.deleted));
    expect(win.__notesQA.runtime.snapshot().notes.find((note: any) => !note.deleted).html).toContain('Last line');
  });
  it('renders HTML-like titles as text and keeps Quill checklist state across save/reopen', async () => {
    await start(); await open(); input('.title-input', '<img src=x onerror=alert(1)> 🧪'); replaceBody('First task\nSecond task\n');
    const quill = win.StellarNoteEditorEngine.Quill.find(get('.note-quill-host')); quill.setSelection(0, quill.getLength() - 1, 'silent'); click('[data-action="checklist"]'); get('.ql-ui').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    click('[data-action="back"]'); await wait(list); expect(doc.querySelector('.note-list h2 img')).toBeNull(); await open();
    expect(Array.from(doc.querySelectorAll('.ql-editor li')).map(li => li.getAttribute('data-list'))).toEqual(['checked', 'unchecked']);
  });
  it('successful confirmed logout clears access but retains the encrypted account profile', async () => {
    await start(true); await wait(() => win.__notesQA.runtime.snapshot().loggedIn); click('[data-action="account"]'); await wait(() => !!doc.querySelector('[data-action="logout"]'));
    click('[data-action="logout"]'); click('#modal [data-close]'); expect(win.__notesQA.runtime.snapshot().loggedIn).toBeTrue();
    click('[data-action="logout"]'); click('#confirm'); await wait(() => !win.__notesQA.runtime.snapshot().loggedIn);
    expect(win.__notesQA.secure.has('ssToken')).toBeFalse(); expect(win.__notesQA.runtime.snapshot().notes).toEqual([]);
    expect([...win.__notesQA.storage.keys()].some((key: any) => key.startsWith('notes.local-profile.v1:'))).toBeTrue();
  });
});
