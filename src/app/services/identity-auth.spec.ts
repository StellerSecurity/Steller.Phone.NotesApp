import { of } from 'rxjs';
import { FormBuilder } from '@angular/forms';
import { ForgotPasswordComponent } from '../profile/forgot-password/forgot-password.component';
import { AuthService } from './auth.service';
import { IdentityAuthService } from './identity-auth.service';
import { sessionToken } from '../utils/session-token';

describe('Protected mobile login', () => {
  it('runs the pinned browser WASM and preserves the export key across login', async () => {
    const opaque = await import('../../../identity-runtime/node_modules/@serenity-kit/opaque');
    await opaque.ready;
    const password = 'synthetic-browser-password';
    const identifiers = {client:'browser@example.invalid',server:'https://id.stellarsecurity.com'};
    const serverSetup = opaque.server.createSetup();
    const start = opaque.client.startRegistration({password});
    const response = opaque.server.createRegistrationResponse({serverSetup,userIdentifier:identifiers.client,registrationRequest:start.registrationRequest});
    const registered = opaque.client.finishRegistration({...start,...response,password,identifiers});
    const login = opaque.client.startLogin({password});
    const challenge = opaque.server.startLogin({serverSetup,registrationRecord:registered.registrationRecord,startLoginRequest:login.startLoginRequest,userIdentifier:identifiers.client,identifiers});
    const finished = opaque.client.finishLogin({...login,...challenge,password,identifiers});
    expect(finished).toBeDefined();
    expect(finished!.exportKey).toBe(registered.exportKey);
    expect(finished!.serverStaticPublicKey).toBe(opaque.server.getPublicKey(serverSetup));
    expect(opaque.server.finishLogin({...challenge,finishLoginRequest:finished!.finishLoginRequest,identifiers}).sessionKey).toBe(finished!.sessionKey);
  }, 15000);

  function setup(method: 'legacy' | 'opaque') {
    const http = { post: jasmine.createSpy('post').and.returnValue(of({ response_code: 200 })) };
    const identity = {
      assertAccount: jasmine.createSpy('assertAccount').and.resolveTo(),
      method: jasmine.createSpy('method').and.resolveTo(method),
      login: jasmine.createSpy('login').and.resolveTo({ accountId: '1' }),
      sessionResponse: jasmine.createSpy('sessionResponse').and.returnValue({ response_code: 200 }),
    };
    const service = new AuthService(http as any, {getItem: async () => null} as any, identity as any);
    return { service, http, identity };
  }

  it('sends no legacy password request for a protected account', async () => {
    const { service, http, identity } = setup('opaque');
    const result = await service.signIn('test@example.invalid', 'synthetic-password');
    expect(identity.login).toHaveBeenCalled();
    expect(result.identity).toBeDefined();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('keeps legacy login after a verified legacy decision', async () => {
    const { service, http, identity } = setup('legacy');
    await service.signIn('test@example.invalid', 'synthetic-password');
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(identity.login).not.toHaveBeenCalled();
  });

  for (const failure of ['method', 'login', 'assertAccount'] as const) {
    it('does not fall back to password login when ' + failure + ' fails', async () => {
      const { service, http, identity } = setup('opaque');
      identity[failure].and.rejectWith(new Error('synthetic failure'));
      await expectAsync(service.signIn('test@example.invalid', 'synthetic-password')).toBeRejected();
      expect(http.post).not.toHaveBeenCalled();
    });
  }

  it('rejects account switching while local account data exists', async () => {
    const service = new IdentityAuthService({} as any, {getItem: async () => JSON.stringify({ email: 'owner@example.invalid' })} as any, {} as any);
    await expectAsync(service.assertAccount('other@example.invalid')).toBeRejected();
    await expectAsync(service.assertAccount(' OWNER@example.invalid ')).toBeResolved();
  });

  for (const metadata of [null, '{}', '{broken', JSON.stringify({ tokenId: '9', expiresAt: '2099-01-01T00:00:00Z' }), JSON.stringify({ tokenId: '1', expiresAt: '2000-01-01T00:00:00Z' })]) {
    it('stops expired or unbound sync without deleting local data: ' + metadata, async () => {
      const values: Record<string, string | null> = {ssToken: '1|synthetic', ssAuthVersion: '2', ssIdentitySession: metadata};
      const store = {getItem: async (key: string) => values[key], removeItem: jasmine.createSpy('removeItem')};
      expect(await sessionToken(store)).toBeNull();
      expect(store.removeItem).not.toHaveBeenCalled();
      expect(values['ssToken']).toBe('1|synthetic');
    });
  }

  it('opens protected recovery without requesting a legacy password reset', async () => {
    const auth = {loginMethod: jasmine.createSpy('method').and.resolveTo('opaque'), forgotPassword: jasmine.createSpy('reset')};
    const router = {navigate: jasmine.createSpy('navigate').and.resolveTo(true)};
    const page = new ForgotPasswordComponent(new FormBuilder(), auth as any, {} as any, router as any, {} as any);
    page.ngOnInit();
    page.forgotPasswordForm.setValue({email:'test@example.invalid'});
    await page.sendCode();
    expect(auth.forgotPassword).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/profile/recover'], {state:{email:'test@example.invalid'}});
    expect(page.isProcessing).toBeFalse();
  });

  it('retains old token semantics without V2 metadata', async () => {
    expect(await sessionToken({getItem: async (key: string) => key === 'ssToken' ? 'old-token' : null})).toBe('old-token');
  });

  it('authorizes sync for an unexpired matching V2 session', async () => {
    const values: Record<string, string | null> = {ssToken:'1|synthetic', ssAuthVersion:'2', ssIdentitySession:JSON.stringify({tokenId:'1',expiresAt:'2099-01-01T00:00:00Z'})};
    expect(await sessionToken({getItem: async (key: string) => values[key]})).toBe('1|synthetic');
  });
});
