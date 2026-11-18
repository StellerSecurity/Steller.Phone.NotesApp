import { sessionToken } from '../utils/session-token';
import { Injectable } from '@angular/core';
import type { Subscription } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthService } from './auth.service';
import { SecureStorageService } from './secure-storage.service';
import { baseUrl } from '../constants/api/product.api';

const allowedRealtimeHosts = new Set([
  'stellar-notes-realtime-prod.webpubsub.azure.com',
  'stellar-notes-realtime-prod.stellarsecurity.com',
]);

export function validRealtimeGrant(value: any, now = Date.now()): boolean {
  try {
    const url = new URL(value.url);
    let onlyAccessToken = true;
    url.searchParams.forEach((_value, key) => { if (key !== 'access_token') onlyAccessToken = false; });
    return value.enabled === true && url.protocol === 'wss:' && !url.username && !url.password
      && !url.port && allowedRealtimeHosts.has(url.hostname)
      && url.pathname === '/client/hubs/notes' && !url.hash && url.searchParams.getAll('access_token').length === 1
      && !!url.searchParams.get('access_token') && onlyAccessToken
      && Number.isFinite(value.expires_at) && value.expires_at > now + 1000 && value.expires_at <= now + 65000;
  } catch { return false; }
}

export function realtimeRetryAfter(error: any, now = Date.now()): number | null {
  if (error?.status !== 429) return null;
  const header = error.headers?.get?.('Retry-After')?.trim();
  const delay = header && /^\d+(?:\.\d+)?$/.test(header)
    ? Number(header) * 1000 : header ? Date.parse(header) - now : NaN;
  return Number.isFinite(delay) ? Math.max(1000, Math.min(delay, 2147483647)) : 60000;
}

/** Notifications are hints only. Existing polling and durable uploads are never stopped. */
@Injectable({ providedIn: 'root' })
export class RealtimeNotesService {
  private started = false;
  private authSubscription?: Subscription;
  private readonly visibilityChanged = () => document.hidden ? this.stop() : this.resume();
  private readonly connected = () => this.resume();
  private readonly disconnected = () => this.stop();
  private generation = 0;
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private expiry?: ReturnType<typeof setTimeout>;
  private failures = 0;
  private lastHint = 0;
  private retryAt = 0;
  private connectingGeneration?: number;
  constructor(private http: HttpClient, private auth: AuthService, private secure: SecureStorageService) {}
  init(): void {
    if (this.started) return;
    this.started = true;
    this.authSubscription = this.auth.loginState$.subscribe(() => this.restart());
    document.addEventListener('visibilitychange', this.visibilityChanged);
    window.addEventListener('online', this.connected);
    window.addEventListener('offline', this.disconnected);
  }
  dispose(): void {
    this.stop();
    this.authSubscription?.unsubscribe();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    window.removeEventListener('online', this.connected);
    window.removeEventListener('offline', this.disconnected);
    this.started = false;
  }
  private stop(): void {
    this.generation++;
    this.connectingGeneration = undefined;
    clearTimeout(this.retry); clearTimeout(this.expiry);
    const socket = this.socket; this.socket = undefined;
    if (socket) { socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.onopen = null; socket.close(); }
  }
  private restart(): void {
    this.stop();
    this.resume();
  }
  private resume(): void {
    if (!this.started || !this.auth.isLoggedIn || document.hidden || !navigator.onLine) return;
    if (this.socket && (this.socket.readyState === 0 || this.socket.readyState === 1)) return;
    if (this.connectingGeneration === this.generation) return;
    clearTimeout(this.retry);
    const remaining = this.retryAt - Date.now();
    if (remaining > 0) {
      this.retry = setTimeout(() => this.resume(), remaining);
      return;
    }
    void this.connect(this.generation);
  }
  private schedule(generation: number, delay: number): void {
    if (generation !== this.generation) return;
    clearTimeout(this.retry);
    this.retryAt = Math.max(this.retryAt, Date.now() + delay);
    this.retry = setTimeout(() => this.restart(), this.retryAt - Date.now());
  }
  private async hint(generation: number, token: string): Promise<void> {
    if (generation !== this.generation || !this.auth.isLoggedIn) return;
    const currentToken = await this.secure.getItem('ssToken');
    if (generation !== this.generation) return;
    if (currentToken !== token) { this.restart(); return; }
    if (Date.now() - this.lastHint < 1000) return;
    this.lastHint = Date.now();
    window.dispatchEvent(new Event('stellar:notes-changed'));
  }
  private async connect(generation: number): Promise<void> {
    this.connectingGeneration = generation;
    try {
      const token = await sessionToken(this.secure);
      if (!token || generation !== this.generation || !this.auth.isLoggedIn) return;
      const grant = await firstValueFrom(this.http.post<any>(baseUrl + 'api/v1/notescontroller/realtime', {}, {
        headers: new HttpHeaders().set('Authorization', `Bearer ${token}`)
      }).pipe(timeout(8000)));
      if (generation !== this.generation || await this.secure.getItem('ssToken') !== token) return;
      if (!validRealtimeGrant(grant)) { this.schedule(generation, grant?.retry_after_ms === 5000 ? 5000 : 300000); return; }
      const socket = new WebSocket(grant.url);
      this.socket = socket;
      this.expiry = setTimeout(() => this.restart(), Math.max(1000, grant.expires_at - Date.now()));
      socket.onopen = () => { this.failures = 0; this.retryAt = 0; void this.hint(generation, token).catch(() => this.restart()); };
      socket.onmessage = event => {
        if (typeof event.data !== 'string' || event.data.length > 128) return;
        try { if (JSON.parse(event.data).type === 'notes.changed') void this.hint(generation, token).catch(() => this.restart()); } catch {}
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => this.schedule(generation, Math.min(60000, 1000 * 2 ** Math.min(++this.failures, 6)) + Math.random() * 1000);
    } catch (error) {
      // Do not log negotiation responses, access URLs or credentials.
      const retryAfter = realtimeRetryAfter(error);
      this.schedule(generation, retryAfter ?? (Math.min(300000, 2000 * 2 ** Math.min(++this.failures, 7)) + Math.random() * 1000));
    } finally {
      if (this.connectingGeneration === generation) this.connectingGeneration = undefined;
    }
  }
}
