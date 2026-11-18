import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { HttpHeaders } from '@angular/common/http';
import { RealtimeNotesService, realtimeRetryAfter } from './realtime-notes.service';

describe('Notes realtime renewal', () => {
  let service: RealtimeNotesService;
  let authState: BehaviorSubject<boolean>;
  let http: any;
  let sockets: any[];
  let nativeWebSocket: typeof WebSocket;
  let hidden: boolean;
  beforeEach(() => {
    hidden = false;
    spyOnProperty(document, 'hidden', 'get').and.callFake(() => hidden);
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    sockets = [];
    class FakeSocket {
      readyState = 0;
      onmessage: any; onopen: any; onclose: any; onerror: any;
      constructor(readonly url: string) { sockets.push(this); }
      close() { this.readyState = 3; this.onclose?.({}); }
    }
    nativeWebSocket = window.WebSocket;
    (window as any).WebSocket = FakeSocket;
    authState = new BehaviorSubject(true);
    const auth = { loginState$: authState.asObservable(), get isLoggedIn() { return authState.value; } };
    http = { post: jasmine.createSpy('post').and.callFake(() => of({ enabled: true, expires_at: Date.now() + 30000,
      url: 'wss://stellar-notes-realtime-prod.webpubsub.azure.com/client/hubs/notes?access_token=synthetic' })) };
    service = new RealtimeNotesService(http, auth as any, { getItem: async (key: string) => key === 'ssToken' ? 'synthetic-session' : null } as any);
  });
  afterEach(() => { service.dispose(); window.WebSocket = nativeWebSocket; });

  it('reads Retry-After seconds and HTTP dates with a safe missing-header fallback', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(realtimeRetryAfter({ status: 429, headers: new HttpHeaders({ 'Retry-After': '30' }) }, now)).toBe(30000);
    expect(realtimeRetryAfter({ status: 429, headers: new HttpHeaders({ 'Retry-After': 'Wed, 18 Nov 2026 12:00:45 GMT' }) }, now)).toBe(45000);
    expect(realtimeRetryAfter({ status: 429, headers: new HttpHeaders({ 'Retry-After': 'bad' }) }, now)).toBe(60000);
    expect(realtimeRetryAfter({ status: 503 }, now)).toBeNull();
  });
  it('does not renegotiate a healthy connection on duplicate foreground or online events', fakeAsync(() => {
    service.init(); flushMicrotasks(); expect(http.post).toHaveBeenCalledTimes(1);
    sockets[0].readyState = 1; sockets[0].onopen(); flushMicrotasks();
    for (let i = 0; i < 4; i++) { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); }
    flushMicrotasks(); expect(http.post).toHaveBeenCalledTimes(1); expect(sockets.length).toBe(1);
    service.dispose();
  }));
  it('does not duplicate a negotiation while its HTTP response is pending', fakeAsync(() => {
    const response = new Subject(); http.post.and.returnValue(response);
    service.init(); flushMicrotasks();
    document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); flushMicrotasks();
    expect(http.post).toHaveBeenCalledTimes(1); response.complete(); flushMicrotasks();
    service.dispose();
  }));
  it('honors a 429 cooldown even across foreground, online and authentication events', fakeAsync(() => {
    http.post.and.returnValue(throwError(() => ({ status: 429, headers: new HttpHeaders({ 'Retry-After': '30' }) })));
    service.init(); flushMicrotasks(); expect(http.post).toHaveBeenCalledTimes(1);
    hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); authState.next(true);
    flushMicrotasks(); tick(29999); expect(http.post).toHaveBeenCalledTimes(1);
    tick(1); flushMicrotasks(); expect(http.post).toHaveBeenCalledTimes(2);
    service.dispose();
  }));
  it('renews when the short-lived notification address expires', fakeAsync(() => {
    service.init(); flushMicrotasks(); sockets[0].readyState = 1; sockets[0].onopen(); flushMicrotasks();
    tick(29999); expect(http.post).toHaveBeenCalledTimes(1);
    tick(1); flushMicrotasks(); expect(http.post).toHaveBeenCalledTimes(2); expect(sockets[0].readyState).toBe(3);
    service.dispose();
  }));
  it('does not keep a connection while the app is hidden or signed out', fakeAsync(() => {
    service.init(); flushMicrotasks(); sockets[0].readyState = 1;
    hidden = true; document.dispatchEvent(new Event('visibilitychange')); expect(sockets[0].readyState).toBe(3);
    window.dispatchEvent(new Event('online')); flushMicrotasks(); expect(http.post).toHaveBeenCalledTimes(1);
    authState.next(false); hidden = false; document.dispatchEvent(new Event('visibilitychange')); flushMicrotasks();
    expect(http.post).toHaveBeenCalledTimes(1);
    service.dispose();
  }));
});
