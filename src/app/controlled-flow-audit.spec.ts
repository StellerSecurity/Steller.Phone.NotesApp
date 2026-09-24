import { fakeAsync, tick } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { NEVER, Subject, of } from 'rxjs';
import { ForgotPasswordComponent } from './profile/forgot-password/forgot-password.component';
import { AuthService } from './services/auth.service';
import { AddNotePage } from './add-note/add-note.page';
import { throwError } from 'rxjs';
import { LoginComponent } from './profile/login/login.component';
import { ShareSecretModalComponent } from './share-secret-modal/share-secret-modal.component';

describe('Controlled failure-path audit', () => {
  it('informs the user when the first download after login fails', async () => {
    const page: any = Object.create(LoginComponent.prototype);
    page.notesApiV1Service = { download: async () => { throw new Error('simulated network outage'); } };
    page.notesService = { getNotes: () => '[]', getDecryptedNotes: () => null };
    page.appsflyer = { logEvent: () => {} };
    page.toastMessageService = { showError: jasmine.createSpy('showError') };
    spyOn(console, 'error');
    await page.syncNotesAfterLogin('');
    expect(page.toastMessageService.showError).toHaveBeenCalled();
  });
  it('ends the busy state and explains a failed shared-link revocation', () => {
    const page: any = Object.create(ShareSecretModalComponent.prototype);
    page.appHaptics = { warning: () => {} };
    page.secretapi = { delete: () => throwError(() => new Error('simulated network outage')) };
    page.toastController = { create: jasmine.createSpy('create').and.resolveTo({present: async () => {}}) };
    page.createdSecret = { id: 'synthetic-only' };
    page.burnSecret();
    expect(page.isDeletingSecret).toBeFalse();
    expect(page.toastController.create).toHaveBeenCalled();
  });
});


describe('Account request recovery', () => {
  function resetPage(response: any) {
    const auth: any = { forgotPassword: jasmine.createSpy('send').and.returnValue(response) };
    const toast: any = { showError: jasmine.createSpy('error').and.resolveTo() };
    const haptics: any = { warning: async () => {}, success: () => {}, selectionChanged: () => {} };
    const page = new ForgotPasswordComponent(new FormBuilder(), auth, toast, {} as any, haptics);
    page.ngOnInit();
    return {page, auth, toast};
  }
  it('starts with email and explains an untouched empty submit without sending', async () => {
    const {page, auth} = resetPage(NEVER);
    expect(page.showVerification).toBeFalse();
    await page.sendCode();
    expect(page.forgotPasswordForm.get('email')?.touched).toBeTrue();
    expect(auth.forgotPassword).not.toHaveBeenCalled();
  });
  it('suppresses double submit, retains email on failure and allows retry', async () => {
    const response = new Subject<any>();
    const {page, auth, toast} = resetPage(response);
    page.forgotPasswordForm.setValue({email: 'synthetic@example.com'});
    await page.sendCode(); await page.sendCode();
    expect(auth.forgotPassword).toHaveBeenCalledTimes(1);
    response.error(new Error('offline'));
    expect(page.isProcessing).toBeFalse();
    expect(page.showVerification).toBeFalse();
    expect(toast.showError).toHaveBeenCalled();
    auth.forgotPassword.and.returnValue(of({response_code: 200}));
    await page.sendCode();
    expect(page.showVerification).toBeTrue();
    await page.sendCode();
    expect(auth.forgotPassword).toHaveBeenCalledTimes(2);
    page.otpValue = '123456'; page.useDifferentEmail();
    expect(page.otpValue).toBe('');
    expect(page.showVerification).toBeFalse();
  });
  it('times out each account request instead of waiting indefinitely', fakeAsync(() => {
    const service = new AuthService({post: () => NEVER} as any, {getItem: async () => null} as any);
    const errors: any[] = [];
    [service.loginHandling({} as any), service.createAccount({} as any), service.forgotPassword('test'), service.resetPassword({})]
      .forEach(request => request.subscribe({error: e => errors.push(e)}));
    tick(14999); expect(errors.length).toBe(0);
    tick(1); expect(errors.length).toBe(4);
    expect(errors.every(e => e.name === 'TimeoutError')).toBeTrue();
  }));
});

describe('Navigation waits for durable editor state', () => {
  it('holds navigation until the pending save finishes', async () => {
    const page: any = Object.create(AddNotePage.prototype);
    let release!: () => void;
    page.saveInProgress = new Promise<void>(resolve => release = resolve);
    page.forceSaveNow = jasmine.createSpy('save');
    page.hasMeaningfulChanges = () => false;
    let finished = false;
    const leaving = page.canLeave().then((allowed: boolean) => { finished = true; return allowed; });
    await Promise.resolve(); expect(finished).toBeFalse();
    release(); expect(await leaving).toBeTrue();
  });
  it('keeps the editor open after persistence failure', async () => {
    const page: any = Object.create(AddNotePage.prototype);
    page.saveInProgress = Promise.resolve();
    page.forceSaveNow = () => {};
    page.persistenceFailed = true;
    expect(await page.canLeave()).toBeFalse();
  });
});


describe('Recovery regression checks', () => {
  it('retries the download and notifies the visible list after persistence', async () => {
    const page: any = Object.create(LoginComponent.prototype);
    let retry!: () => void;
    let refreshed!: () => void;
    const updated = new Promise<void>(resolve => refreshed = resolve);
    const download = jasmine.createSpy('download').and.rejectWith(new Error('offline'));
    page.notesApiV1Service = {download};
    page.authService = {isLoggedIn: true};
    page.notesService = {getNotes: () => '[]', getDecryptedNotes: () => null,
      appHasPasswordChallenge: () => false, setNotes: () => {}, setFolders: () => {},
      setDecryptedNotes: () => {}, flushPersistence: async () => {}, refreshRequested$: {next: () => refreshed()}};
    page.appsflyer = {logEvent: () => {}};
    page.toastMessageService = {showError: async (_message: string, callback: () => void) => { retry = callback; }};
    spyOn(console, 'error');
    await page.syncNotesAfterLogin('');
    download.and.resolveTo({notes: [], folders: []});
    retry(); retry();
    await updated;
    expect(download).toHaveBeenCalledTimes(2);
  });
  it('does not enqueue an already saved edit again when leaving', () => {
    const page: any = Object.create(AddNotePage.prototype);
    page.initialNoteSnapshot = {text: 'old'};
    page.lastSavedSnapshot = {text: 'new'};
    page.createCurrentSnapshot = () => ({text: 'new'});
    page.snapshotsEqual = (a: any, b: any) => a.text === b.text;
    expect(page.hasMeaningfulChanges()).toBeFalse();
  });
  it('also saves edits made while navigation waits for an earlier save', async () => {
    const page: any = Object.create(AddNotePage.prototype);
    let release!: () => void;
    page.saveInProgress = new Promise<void>(resolve => release = resolve);
    page.isEffectivelyEmptyNewNote = () => false;
    let dirty = true;
    page.hasMeaningfulChanges = () => dirty;
    let attempts = 0;
    page.forceSaveNow = () => {
      if (++attempts === 2) { dirty = false; page.saveInProgress = Promise.resolve(); }
    };
    const leaving = page.canLeave(); release();
    expect(await leaving).toBeTrue();
    expect(attempts).toBe(2);
  });
});
