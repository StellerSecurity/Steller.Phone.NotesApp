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
  const start = async (signedIn = false, options = '') => {
    frame = document.createElement('iframe'); frame.style.cssText = 'width:390px;height:844px';
    frame.src = '/base/local/release-ui/index.html' + (signedIn ? '?signed-in=1&' : '?') + options; document.body.appendChild(frame);
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
  it('defaults Trash off for an empty installation and preserves a saved off choice', async () => {
    await start(false, 'empty=1'); click('[data-page="settings"]');
    expect(get('[data-toggle="trash"]').getAttribute('aria-checked')).toBe('false');
    click('[data-toggle="trash"]'); await wait(() => win.__notesQA.storage.get('notes.design.preferences.v1')?.trash === true);
    expect(get('[data-toggle="trash"]').getAttribute('aria-checked')).toBe('true');
  });
  it('disabling Trash preserves access to existing trashed notes and their restoration', async () => {
    await start(); await open(); click('[data-action="more"]'); click('[data-menu="delete"]'); click('#confirm'); await wait(list);
    await wait(() => win.__notesQA.runtime.snapshot().notes[0].deleted);
    click('[data-page="settings"]'); click('[data-toggle="trash"]');
    await wait(() => win.__notesQA.storage.get('notes.design.preferences.v1')?.trash === false);
    expect(win.__notesQA.runtime.snapshot().notes[0].deleted).toBeTrue();
    click('[data-page="folders"]'); click('[data-action="trash"]'); click('[data-note]'); click('[data-action="restore"]');
    await wait(() => win.__notesQA.runtime.snapshot().notes.some((n:any) => !n.deleted));
    expect(win.__notesQA.runtime.snapshot().notes.find((n:any)=>!n.deleted).html).toContain('Last line');
  });
  it('with Trash off, cancellation keeps content and confirmation permanently removes only the chosen note', async () => {
    await start(false, 'trash-off=1'); click('[data-page="settings"]');
    expect(get('[data-toggle="trash"]').getAttribute('aria-checked')).toBe('false');
    click('[data-page="notes"]'); await open(); click('[data-action="more"]'); click('[data-menu="delete"]');
    expect(get('#modal').textContent).toContain('permanently'); click('#modal [data-close]'); expect(body()).toContain('Last line');
    click('[data-action="more"]'); click('[data-menu="delete"]'); click('#confirm');
    await wait(() => win.__notesQA.runtime.snapshot().notes.length === 0);
  });
  it('renders HTML-like titles as text and keeps Quill checklist state across save/reopen', async () => {
    await start(); await open(); input('.title-input', '<img src=x onerror=alert(1)> 🧪'); replaceBody('First task\nSecond task\n');
    const quill = win.StellarNoteEditorEngine.Quill.find(get('.note-quill-host')); quill.setSelection(0, quill.getLength() - 1, 'silent'); click('[data-action="checklist"]'); get('.ql-ui').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    click('[data-action="back"]'); await wait(list); expect(doc.querySelector('.note-list h2 img')).toBeNull(); await open();
    expect(Array.from(doc.querySelectorAll('.ql-editor li')).map(li => li.getAttribute('data-list'))).toEqual(['checked', 'unchecked']);
  });
  const confirmBackupCode = () => {
    click('[data-action="save-encrypted-backup"]');
    const displayed=get('[data-backup-secret]').textContent!;
    expect(displayed).toMatch(/^[0-9]{5}(-[0-9]{5}){5}$/);
    const code=displayed.replace(/-/g,'');input('#backup-code-confirm input',displayed);click('#backup-code-confirm .primary');return code;
  };
  it('offers only encrypted backup and import, without plaintext export or the removed helper',async()=>{
    await start();click('[data-page="settings"]');
    expect(get('[data-local-export-section]').hidden).toBeFalse();
    expect(doc.querySelector('[data-action="save-locally"]')).toBeNull();expect(doc.querySelector('[data-action="save-encrypted-backup"]')).not.toBeNull();expect(doc.querySelector('[data-action="import-backup"]')).not.toBeNull();
    expect(get('[data-local-export-section]').textContent).not.toContain('30-digit');
    expect(get('[data-local-export-section]').textContent).not.toContain('unencrypted');
  });
  it('asks for the app code again before encrypted backup while already unlocked', async () => {
    await start(); await win.__notesQA.runtime.setAppLock('FreshCode103!');click('[data-page="settings"]');confirmBackupCode();await wait(()=>!!doc.querySelector('#live-password'));
    input('#live-password input','wrong');click('#live-password .primary');await wait(()=>!get('#note-password-error').hidden);expect(win.__notesQA.exportCalls).toBe(0);
    input('#live-password input','FreshCode103!');click('#live-password .primary');await wait(()=>win.__notesQA.exportCalls===1&&!doc.getElementById('app')?.inert);
    confirmBackupCode();await wait(()=>!!doc.querySelector('#live-password'));expect(win.__notesQA.exportCalls).toBe(1);click('#modal [data-close]');
    expect(win.__notesQA.runtime.snapshot().notes[0].html).toContain('Last line');
  });
  it('requires the generated 30-digit backup code to be recorded, then sends only ciphertext to the native exporter', async () => {
    await start();click('[data-page="settings"]');click('[data-action="save-encrypted-backup"]');
    const code=get('[data-backup-secret]').textContent!.replace(/[ -]/g,'');expect(code).toMatch(/^[0-9]{30}$/);
    input('#backup-code-confirm input','0'.repeat(30));click('#backup-code-confirm .primary');expect(get('#backup-code-error').hidden).toBeFalse();expect(win.__notesQA.exportCalls).toBe(0);
    input('#backup-code-confirm input',code);click('#backup-code-confirm .primary');await wait(()=>win.__notesQA.exportCalls===1&&!doc.getElementById('app')?.inert);
    const saved=win.__notesQA.exportPayloads[0];expect(saved.format).toBe('stellar-encrypted-local-export');expect(saved.backup.kdf).toBe('argon2id13');
    expect(JSON.stringify(saved)).not.toContain('Release QA');expect(JSON.stringify(saved)).not.toContain('Last line');expect(JSON.stringify(saved)).not.toContain(code);
    expect(doc.querySelector('[data-backup-secret]')?.textContent || '').toBe('');expect(win.__notesQA.runtime.snapshot().notes[0].html).toContain('Last line');
    const before=win.__notesQA.runtime.snapshot().notes[0];click('[data-action="import-backup"]');
    const transfer=new win.DataTransfer();transfer.items.add(new win.File([JSON.stringify(saved.backup)],'synthetic.stellarbackup',{type:'application/octet-stream'}));
    (get('#backup-import input[type=file]') as HTMLInputElement).files=transfer.files;
    input('#backup-import input[type=password]',code);click('#backup-import .primary');await wait(()=>!!doc.querySelector('#backup-import-confirm'));
    expect(win.__notesQA.runtime.snapshot().notes.length).toBe(1);click('#backup-import-confirm');
    await wait(()=>win.__notesQA.runtime.snapshot().notes.length===2);
    const copies=win.__notesQA.runtime.snapshot().notes;expect(copies.find((n:any)=>n.id===before.id).html).toBe(before.html);
    expect(copies.find((n:any)=>n.id!==before.id).html).toBe(before.html);

  });
  it('successful confirmed logout clears access but retains the encrypted account profile', async () => {
    await start(true); await wait(() => win.__notesQA.runtime.snapshot().loggedIn); click('[data-action="account"]'); await wait(() => !!doc.querySelector('[data-action="logout"]'));
    click('[data-action="logout"]'); click('#modal [data-close]'); expect(win.__notesQA.runtime.snapshot().loggedIn).toBeTrue();
    click('[data-action="logout"]'); click('#confirm'); await wait(() => !win.__notesQA.runtime.snapshot().loggedIn);
    expect(win.__notesQA.secure.has('ssToken')).toBeFalse(); expect(win.__notesQA.runtime.snapshot().notes).toEqual([]);
    expect([...win.__notesQA.storage.keys()].some((key: any) => key.startsWith('notes.local-profile.v1:'))).toBeTrue();
  });
});
