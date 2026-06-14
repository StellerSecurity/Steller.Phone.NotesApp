import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

interface AppsFlyerInitOptions {
  devKey: string;
  appId?: string;
  isDebug?: boolean;
}

/**
 * Android registers the native plugin as "AppsFlyerPlugin".
 * If this is registered as "AppsFlyer", Capacitor throws:
 * "AppsFlyer plugin is not implemented on android".
 */
const AppsFlyer: any = registerPlugin('AppsFlyerPlugin');

@Injectable({ providedIn: 'root' })
export class AppsflyerService {
  private initialized = false;
  private initFailed = false;
  private initializing: Promise<void> | null = null;
  private readonly oncePrefix = 'appsflyer_once_';

  async init(options?: Partial<AppsFlyerInitOptions>): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = this.initInternal(options);
    await this.initializing;
  }

  private async initInternal(options?: Partial<AppsFlyerInitOptions>): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.initialized = true;
      return;
    }

    try {
      const cfg: AppsFlyerInitOptions = {
        devKey: (options?.devKey || (window as any)?.env?.APPSFLYER_DEV_KEY || '').trim(),
        appId: (options?.appId || (window as any)?.env?.IOS_APP_ID || undefined),
        isDebug: options?.isDebug ?? false,
      };

      if (!cfg.devKey) {
        console.warn('[AppsFlyer] Missing devKey; initialization skipped.');
        this.initialized = true;
        this.initFailed = true;
        return;
      }

      await AppsFlyer.initSDK({
        devKey: cfg.devKey,
        appId: cfg.appId,
        isDebug: cfg.isDebug,
      });

      this.initFailed = false;
    } catch (err) {
      this.initFailed = true;
      console.warn('[AppsFlyer] init failed:', err);
    } finally {
      this.initialized = true;
      this.initializing = null;
    }
  }

  async logEvent(name: string, values: Record<string, any> = {}): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      await this.init();

      if (this.initFailed) {
        return;
      }

      await AppsFlyer.logEvent({
        eventName: name,
        eventValues: this.cleanValues(values),
      });
    } catch (err) {
      console.warn('[AppsFlyer] logEvent failed:', err);
    }
  }

  async logEventOnce(name: string, values: Record<string, any> = {}, key = name): Promise<void> {
    const storageKey = `${this.oncePrefix}${key}`;
    const existing = await Preferences.get({ key: storageKey });

    if (existing.value === '1') {
      return;
    }

    await this.logEvent(name, values);

    if (!this.initFailed) {
      await Preferences.set({ key: storageKey, value: '1' });
    }
  }

  countBucket(count: number): '0' | '1' | '2_5' | '6_20' | '20_plus' {
    if (count <= 0) return '0';
    if (count === 1) return '1';
    if (count <= 5) return '2_5';
    if (count <= 20) return '6_20';
    return '20_plus';
  }

  booleanLabel(value: boolean): 'true' | 'false' {
    return value ? 'true' : 'false';
  }

  private cleanValues(values: Record<string, any>): Record<string, string | number | boolean> {
    const safe: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(values || {})) {
      if (value === undefined || value === null) continue;

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        safe[key] = value;
      }
    }

    return safe;
  }
}
