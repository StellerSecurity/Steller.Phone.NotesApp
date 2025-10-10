/*
 * crypto-key.service.ts
 * Angular/Ionic service for generating & managing E2EE keys using the Web Crypto API.
 * - Password → PBKDF2 → session AES-GCM key
 * - Random 256-bit Master Key (MK) used to encrypt/decrypt notes
 * - MK is encrypted ("wrapped") with the password-derived key and stored locally
 * - All encryption/decryption happens client-side; server only sees ciphertext
 *
 * Drop-in usage example (pseudo):
 *   await cryptoKeySvc.createVault(password)          // First-time setup
 *   await cryptoKeySvc.unlock(password)               // On app start after user login
 *   const blob = await cryptoKeySvc.encryptText("hello")
 *   const plain = await cryptoKeySvc.decryptText(blob)
 *
 * Storage schema (localStorage):
 *   stellar:e2ee:v1 = {
 *     v: 1,
 *     kdf: { algo: 'PBKDF2', hash: 'SHA-256', iters: 210000, salt_b64 },
 *     mk_wrapped_b64,                         // AES-GCM(passwordKey) over raw MK bytes
 *     mk_iv_b64,                              // IV used when wrapping MK
 *     created_at, rotated_at
 *   }
 */

import { Injectable } from '@angular/core';

// ----- Helpers -----
const TEXT = new TextEncoder();
const UNT = new TextDecoder();

function b64encode(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(b64: string): ArrayBuffer {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    return out;
}

// ----- Types -----
export interface KdfParamsPBKDF2 {
    algo: 'PBKDF2';
    hash: 'SHA-256';
    iters: number;       // e.g., 210_000
    salt_b64: string;    // 16–32 bytes
}

export interface VaultHeaderV1 {
    v: 1;
    kdf: KdfParamsPBKDF2;
    mk_wrapped_b64: string;  // AES-GCM(passwordKey) over MK raw bytes
    mk_iv_b64: string;       // IV used when wrapping MK
    created_at: number;
    rotated_at?: number | null;
}

export interface CipherBlobV1 {
    v: 1;
    iv_b64: string;      // 12-byte IV
    ct_b64: string;      // ciphertext+authTag (GCM)
    aad_b64?: string;    // optional AAD (e.g., note id)
}

const VAULT_KEY = 'stellar:e2ee:v1';

@Injectable({ providedIn: 'root' })
export class CryptoKeyService {
    private mkKey: CryptoKey | null = null; // Decrypted Master Key (AES-GCM 256)
    private unlockedAt: number | null = null;

    // ---------- Public API ----------

    /** Check whether a vault already exists in storage */
    hasVault(): boolean {
        return !!localStorage.getItem(VAULT_KEY);
    }

    /** Create a brand-new vault: generates a new Master Key and wraps it with password key. */
    async createVault(password: string, iters = 210_000): Promise<void> {
        if (!password || password.length < 6) throw new Error('Weak password');

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const passKey = await this.derivePasswordKey(password, salt, iters);

        // Generate 256-bit Master Key (MK)
        const mkRaw = crypto.getRandomValues(new Uint8Array(32)).buffer;
        const mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt', 'decrypt']);

        // Wrap (encrypt) MK with password-derived AES-GCM key
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, passKey, mkRaw);

        const header: VaultHeaderV1 = {
            v: 1,
            kdf: { algo: 'PBKDF2', hash: 'SHA-256', iters, salt_b64: b64encode(salt.buffer) },
            mk_wrapped_b64: b64encode(wrapped),
            mk_iv_b64: b64encode(iv.buffer),
            created_at: Date.now(),
            rotated_at: null,
        };

        localStorage.setItem(VAULT_KEY, JSON.stringify(header));
        // Keep MK in memory for immediate use
        this.mkKey = mkKey;
        this.unlockedAt = Date.now();
    }

    /** Unlock existing vault by decrypting MK into memory. */
    async unlock(password: string): Promise<void> {
        const raw = localStorage.getItem(VAULT_KEY);
        if (!raw) throw new Error('No vault');
        const header = JSON.parse(raw) as VaultHeaderV1;

        const salt = new Uint8Array(b64decode(header.kdf.salt_b64));
        const passKey = await this.derivePasswordKey(password, salt, header.kdf.iters);

        const iv = new Uint8Array(b64decode(header.mk_iv_b64));
        const wrapped = b64decode(header.mk_wrapped_b64);

        const mkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, passKey, wrapped);
        this.mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt', 'decrypt']);
        this.unlockedAt = Date.now();
    }

    /** Lock: wipe MK from memory (user stays logged in app, but cannot decrypt). */
    lock(): void {
        this.mkKey = null;
        this.unlockedAt = null;
    }

    /** Rotate the Master Key and re-wrap with password key. You should re-encrypt notes lazily on edit. */
    async rotateMasterKey(password: string): Promise<void> {
        const raw = localStorage.getItem(VAULT_KEY);
        if (!raw) throw new Error('No vault');
        const header = JSON.parse(raw) as VaultHeaderV1;

        const salt = new Uint8Array(b64decode(header.kdf.salt_b64));
        const passKey = await this.derivePasswordKey(password, salt, header.kdf.iters);

        // new MK
        const mkRaw = crypto.getRandomValues(new Uint8Array(32)).buffer;
        const mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt', 'decrypt']);

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, passKey, mkRaw);

        const newHeader: VaultHeaderV1 = { ...header, mk_wrapped_b64: b64encode(wrapped), mk_iv_b64: b64encode(iv.buffer), rotated_at: Date.now() };
        localStorage.setItem(VAULT_KEY, JSON.stringify(newHeader));
        this.mkKey = mkKey;
    }

    /** Change password without changing MK: re-wrap MK with new password key. */
    async changePassword(oldPassword: string, newPassword: string, newIters?: number): Promise<void> {
        if (!newPassword || newPassword.length < 6) throw new Error('Weak password');

        // unlock using old
        await this.unlock(oldPassword);
        if (!this.mkKey) throw new Error('Unlock failed');

        const mkRaw = await crypto.subtle.exportKey('raw', this.mkKey);

        // new KDF params
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iters = newIters ?? 210_000;
        const passKey = await this.derivePasswordKey(newPassword, salt, iters);

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, passKey, mkRaw);

        const header: VaultHeaderV1 = {
            v: 1,
            kdf: { algo: 'PBKDF2', hash: 'SHA-256', iters, salt_b64: b64encode(salt.buffer) },
            mk_wrapped_b64: b64encode(wrapped),
            mk_iv_b64: b64encode(iv.buffer),
            created_at: Date.now(),
            rotated_at: null,
        };
        localStorage.setItem(VAULT_KEY, JSON.stringify(header));
    }

    /** Encrypt UTF-8 string with MK (AES-GCM). Optionally bind to AAD (e.g., note id). */
    async encryptText(plain: string, aad?: string): Promise<CipherBlobV1> {
        if (!this.mkKey) throw new Error('Locked');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ad = aad ? TEXT.encode(aad) : undefined;
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad }, this.mkKey, TEXT.encode(plain));
        return { v: 1, iv_b64: b64encode(iv.buffer), ct_b64: b64encode(ct), aad_b64: ad ? b64encode(ad.buffer) : undefined };
    }

    /** Decrypt to UTF-8 string with MK */
    async decryptText(blob: CipherBlobV1): Promise<string> {
        if (!this.mkKey) throw new Error('Locked');
        if (blob.v !== 1) throw new Error('Unsupported blob version');
        const iv = new Uint8Array(b64decode(blob.iv_b64));
        const ad = blob.aad_b64 ? new Uint8Array(b64decode(blob.aad_b64)) : undefined;
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: ad }, this.mkKey, b64decode(blob.ct_b64));
        return UNT.decode(pt);
    }

    /** Encrypt arbitrary bytes with MK */
    async encryptBytes(bytes: ArrayBuffer, aad?: string): Promise<CipherBlobV1> {
        if (!this.mkKey) throw new Error('Locked');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ad = aad ? TEXT.encode(aad) : undefined;
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad }, this.mkKey, bytes);
        return { v: 1, iv_b64: b64encode(iv.buffer), ct_b64: b64encode(ct), aad_b64: ad ? b64encode(ad.buffer) : undefined };
    }

    /** Decrypt arbitrary bytes with MK */
    async decryptBytes(blob: CipherBlobV1): Promise<ArrayBuffer> {
        if (!this.mkKey) throw new Error('Locked');
        if (blob.v !== 1) throw new Error('Unsupported blob version');
        const iv = new Uint8Array(b64decode(blob.iv_b64));
        const ad = blob.aad_b64 ? new Uint8Array(b64decode(blob.aad_b64)) : undefined;
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: ad }, this.mkKey, b64decode(blob.ct_b64));
    }

    /** Export a recovery package you can sync with the server (still zero-knowledge): header JSON only. */
    exportRecoveryHeader(): VaultHeaderV1 {
        const raw = localStorage.getItem(VAULT_KEY);
        if (!raw) throw new Error('No vault');
        return JSON.parse(raw) as VaultHeaderV1;
    }

    /** Replace the local header (e.g., when restoring to a new device), then call unlock(password). */
    importRecoveryHeader(header: VaultHeaderV1) {
        if (header.v !== 1) throw new Error('Unsupported header');
        localStorage.setItem(VAULT_KEY, JSON.stringify(header));
    }

    /** Optional hygiene: auto-lock timer check (e.g., call in an interval). */
    shouldAutoLock(maxMinutes = 30): boolean {
        if (!this.unlockedAt) return true;
        const ms = maxMinutes * 60 * 1000;
        return Date.now() - this.unlockedAt > ms;
    }

    // ---------- Internals ----------

    private async derivePasswordKey(password: string, salt: Uint8Array, iters: number): Promise<CryptoKey> {
        const baseKey = await crypto.subtle.importKey(
            'raw', TEXT.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
}


// ==============================================
// DB-COMPATIBLE HELPERS (Pack IV into `eak`)
// ==============================================
// Your DB does not store mk_iv separately. Use the helpers below so that
// `eak` becomes base64( IV(12 bytes) || ciphertext+authTag ).
// Keep the local header unchanged (mk_iv_b64 + mk_wrapped_b64) for clarity.

export type ServerBundle = {
    crypto_version: 'v1';
    kdf_params: KdfParamsPBKDF2;
    kdf_salt: string;   // base64
    eak: string;        // base64(IV||CT)
};

/** Export bundle for server: packs IV into eak */
export function exportServerBundleFromHeader(header: VaultHeaderV1): ServerBundle {
    const iv = new Uint8Array(b64decode(header.mk_iv_b64));
    const ct = new Uint8Array(b64decode(header.mk_wrapped_b64));
    const packed = concat(iv, ct);
    return {
        crypto_version: 'v1',
        kdf_params: header.kdf,
        kdf_salt: header.kdf.salt_b64,
        eak: b64encode(packed.buffer),
    };
}

/** Simple guard + unpacker */
export function unpackEak(eakBase64: string): { iv: Uint8Array; ct: Uint8Array } {
    const packed = new Uint8Array(b64decode(eakBase64));
    if (packed.byteLength < 12 + 16) throw new Error('Invalid eak size');
    const iv = packed.slice(0, 12);
    const ct = packed.slice(12);
    return { iv, ct };
}

// ---- Instance methods to place inside CryptoKeyService if preferred ----
// (Add these methods directly in the class if you want instance access)
//
// exportServerBundle() { ... } and importFromServerBundle(...) versions are below.

// Copy these bodies *inside* the CryptoKeyService class if you want them as methods:
//
//  exportServerBundle() {
//    const raw = localStorage.getItem(VAULT_KEY);
//    if (!raw) throw new Error('No vault');
//    const h = JSON.parse(raw) as VaultHeaderV1;
//    const iv = new Uint8Array(b64decode(h.mk_iv_b64));
//    const ct = new Uint8Array(b64decode(h.mk_wrapped_b64));
//    const packed = concat(iv, ct);
//    return { crypto_version: 'v1', kdf_params: h.kdf, kdf_salt: h.kdf.salt_b64, eak: b64encode(packed.buffer) } as ServerBundle;
//  }
//
//  async importFromServerBundle(bundle: ServerBundle, password: string) {
//    const salt = new Uint8Array(b64decode(bundle.kdf_salt));
//    const passKey = await this.derivePasswordKey(password, salt, bundle.kdf_params.iters);
//    const { iv, ct } = unpackEak(bundle.eak);
//    const mkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, passKey, ct);
//    const mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt','decrypt']);
//    // Re-wrap locally with fresh IV
//    const newIv = crypto.getRandomValues(new Uint8Array(12));
//    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newIv }, passKey, mkRaw);
//    const header: VaultHeaderV1 = {
//      v: 1,
//      kdf: { algo: 'PBKDF2', hash: 'SHA-256', iters: bundle.kdf_params.iters, salt_b64: bundle.kdf_salt },
//      mk_wrapped_b64: b64encode(wrapped),
//      mk_iv_b64: b64encode(newIv.buffer),
//      created_at: Date.now(),
//      rotated_at: null,
//    };
//    localStorage.setItem(VAULT_KEY, JSON.stringify(header));
//    this.mkKey = mkKey;
//    this.unlockedAt = Date.now();
//  }
