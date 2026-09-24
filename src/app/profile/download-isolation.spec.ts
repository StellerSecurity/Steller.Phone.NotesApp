import { FormControl, FormGroup, Validators } from '@angular/forms';
import { LoginComponent } from './login/login.component';
import { CreateAccountComponent } from './create-account/create-account.component';
import { encryptTextWithMK, packCipherBlob } from '@stellarsecurity/stellar-crypto';

describe('Initial download isolates corrupt notes', () => {
  for (const [type, method] of [[LoginComponent, 'syncNotesAfterLogin'], [CreateAccountComponent, 'syncNotesAfterRegister']] as const) {
    it('continues healthy notes in ' + method, async () => {
      const key = new Uint8Array(32).fill(3);
      const body = packCipherBlob(await encryptTextWithMK(key, 'healthy', 'good'));
      const page: any = Object.create(type.prototype);
      page.notesApiV1Service = { download: async () => ({ notes: [
        { id: 'bad', text: 'invalid', last_modified: 100 },
        { id: 'good', text: body, last_modified: 100 },
      ], folders: [] }) };
      page.notesService = { getNotes: () => '[]', getDecryptedNotes: () => null,
        appHasPasswordChallenge: () => false, setNotes: jasmine.createSpy('save'), setFolders: () => {},
        setDecryptedNotes: () => {}, flushPersistence: async () => {} };
      page.toastMessageService = { showError: jasmine.createSpy('warning').and.resolveTo() };
      page.appsflyer = { logEvent: jasmine.createSpy('failure') };
      await page[method](btoa(String.fromCharCode(...key)));
      expect(JSON.parse(page.notesService.setNotes.calls.mostRecent().args[0]).map((n: any) => n.id)).toEqual(['good']);
      expect(page.toastMessageService.showError).toHaveBeenCalled();
      expect(page.appsflyer.logEvent).not.toHaveBeenCalled();
    });
  }
});


describe('Login validation', () => {
  it('marks untouched required fields on submit without attempting authentication', async () => {
    const page: any = Object.create(LoginComponent.prototype);
    page.loginForm = new FormGroup({
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', Validators.required),
    });
    page.appHaptics = { warning: jasmine.createSpy('warning').and.resolveTo() };
    await page.login();
    expect(page.loginForm.get('email').touched).toBeTrue();
    expect(page.loginForm.get('password').touched).toBeTrue();
    expect(page.loginForm.get('email').hasError('required')).toBeTrue();
    expect(page.loginForm.get('password').hasError('required')).toBeTrue();
    expect(page.isSaving).toBeUndefined();
  });
});
