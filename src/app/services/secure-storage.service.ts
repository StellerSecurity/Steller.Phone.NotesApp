// secure-storage.service.ts
import { Injectable } from '@angular/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

@Injectable({
  providedIn: 'root'
})
export class SecureStorageService {
  constructor() {}

  async setItem(key: string, value: string): Promise<void> {
    await SecureStoragePlugin.set({ key, value });
  }

  async getItem(key: string): Promise<string | null> {
    const result = await SecureStoragePlugin.get({ key });
    return result?.value || null;
  }

  async removeItem(key: string): Promise<void> {
    await SecureStoragePlugin.remove({ key });
  }

  async clear(): Promise<void> {
    await SecureStoragePlugin.clear();
  }

  async keys(): Promise<string[]> {
    const result:any = await SecureStoragePlugin.keys();
    return result?.keys || [];
  }
}
