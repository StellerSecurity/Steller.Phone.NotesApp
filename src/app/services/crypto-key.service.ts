import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * CryptoKeyService — WebCrypto-based E2EE for Stellar Private Notes
 * - Password → PBKDF2(SHA-256, iters, salt) → Password-Key (PK)
 * - Random 32-byte Master Key (MK) encrypts all note content (AES-GCM 256)
 * - Local header: stores mk_wrapped_b64 + mk_iv_b64 in localStorage
 * - Server bundle: packs IV into eak = base64( IV(12) || ciphertext+tag )
 */

const VAULT_KEY = 'stellar:e2ee:v1';

type AlgoPBKDF2 = 'PBKDF2';
type HashSHA256 = 'SHA-256';

export interface KdfParamsPBKDF2 {
    algo: AlgoPBKDF2;              // 'PBKDF2'
    hash: HashSHA256;              // 'SHA-256'
    iters: number;                 // e.g., 210_000
    // NOTE: the authoritative salt lives top-level as base64 (kdf_salt / kdf.kdf_salt_b64);
    // you can include salt_b64 here too, but we treat top-level salt as source of truth.
    salt_b64?: string;
}

export interface VaultHeaderV1 {
    v: 1;
    kdf: KdfParamsPBKDF2 & { salt_b64: string };
    mk_wrapped_b64: string;  // AES-GCM(PK, MK_raw)
    mk_iv_b64: string;       // 12-byte IV used for wrapping MK (local header ONLY)
    created_at: number;
    rotated_at?: number | null;
}

export type ServerBundle = {
    crypto_version: 'v1';
    kdf_params: KdfParamsPBKDF2; // { algo:'PBKDF2', hash:'SHA-256', iters }
    kdf_salt: string;            // base64
    eak: string;                 // base64( IV(12) || ciphertext+tag )
};

export interface CipherBlobV1 {
    v: 1;
    iv_b64: string;      // 12-byte IV (base64)
    ct_b64: string;      // ciphertext+tag (base64)
    aad_b64?: string;    // optional (base64)
}

/* --------------------- Small helpers --------------------- */
const TEXT = new TextEncoder();
const UNT  = new TextDecoder();

function b64encode(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
}

function b64decode(b64: string): ArrayBuffer {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    return out;
}

/* Pack/unpack for note bodies (same style as eak) */
export function packCipherBlob(b: { iv_b64: string; ct_b64: string }): string {
    const iv = new Uint8Array(b64decode(b.iv_b64));
    const ct = new Uint8Array(b64decode(b.ct_b64));
    return b64encode(concat(iv, ct));
}
export function unpackCipherBlob(packedB64: string): CipherBlobV1 {
    const bytes = new Uint8Array(b64decode(packedB64));
    if (bytes.length < 12 + 16) throw new Error('cipher too short');
    const iv = bytes.slice(0, 12);
    const ct = bytes.slice(12);
    return { v: 1, iv_b64: b64encode(iv), ct_b64: b64encode(ct) };
}

@Injectable({ providedIn: 'root' })
export class CryptoKeyService {
    /** Decrypted Master Key (AES-GCM 256), held in memory while unlocked */
    private mkKey: CryptoKey | null = null;
    private unlockedAt: number | null = null;

    /** App-wide observable so other code can wait on unlock */
    private unlockedSubject = new BehaviorSubject<boolean>(false);
    public  isUnlocked$     = this.unlockedSubject.asObservable();

    /* --------------------- Vault lifecycle --------------------- */

    /** First-time setup: generate MK, derive PK from password, wrap MK, store local header */
    async createVault(password: string, iters = 210_000): Promise<void> {
        if (!password || password.length < 6) throw new Error('Weak password');

        const salt = crypto.getRandomValues(new Uint8Array(16));
        const passKey = await this.derivePasswordKey(password, salt, iters);

        const mkRaw = crypto.getRandomValues(new Uint8Array(32)).buffer; // 256-bit MK
        const mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt', 'decrypt']);

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, passKey, mkRaw);

        const header: VaultHeaderV1 = {
            v: 1,
            kdf: { algo: 'PBKDF2', hash: 'SHA-256', iters, salt_b64: b64encode(salt) },
            mk_wrapped_b64: b64encode(wrapped),
            mk_iv_b64: b64encode(iv),
            created_at: Date.now(),
            rotated_at: null,
        };
        localStorage.setItem(VAULT_KEY, JSON.stringify(header));

        this.mkKey = mkKey;
        this.unlockedAt = Date.now();
        this.unlockedSubject.next(true);
    }

    /** Unlock using password against the *local header* */
    async unlock(password: string): Promise<void> {
        const raw = localStorage.getItem(VAULT_KEY);
        if (!raw) throw new Error('No vault');
        const h: VaultHeaderV1 = JSON.parse(raw);

        const salt = new Uint8Array(b64decode(h.kdf.salt_b64));
        const passKey = await this.derivePasswordKey(password, salt, h.kdf.iters);

        const iv = new Uint8Array(b64decode(h.mk_iv_b64));
        const wrapped = b64decode(h.mk_wrapped_b64);

        const mkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, passKey, wrapped);
        this.mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt', 'decrypt']);
        this.unlockedAt = Date.now();
        this.unlockedSubject.next(true);
    }

    /** Lock: wipe MK from memory */
    lock(): void {
        this.mkKey = null;
        this.unlockedAt = null;
        this.unlockedSubject.next(false);
    }

    /** Auto-lock helper: returns true if you should lock given idle minutes */
    shouldAutoLock(maxMinutes = 30): boolean {
        if (!this.unlockedAt) return true;
        return Date.now() - this.unlockedAt > maxMinutes * 60_000;
    }

    /** Rotate MK (generate new MK). Re-wrap with current password key (requires password) */
    async rotateMasterKey(password: string): Promise<void> {
        const raw = localStorage.getItem(VAULT_KEY);
        if (!raw) throw new Error('No vault');
        const h: VaultHeaderV1 = JSON.parse(raw);

        const salt = new Uint8Array(b64decode(h.kdf.salt_b64));
        const passKey = await this.derivePasswordKey(password, salt, h.kdf.iters);

        const mkRaw = crypto.getRandomValues(new Uint8Array(32)).buffer;
        const mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt','decrypt']);

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, passKey, mkRaw);

        const header: VaultHeaderV1 = { ...h, mk_wrapped_b64: b64encode(wrapped), mk_iv_b64: b64encode(iv), rotated_at: Date.now() };
        localStorage.setItem(VAULT_KEY, JSON.stringify(header));
        this.mkKey = mkKey;
        this.unlockedAt = Date.now();
        this.unlockedSubject.next(true);
    }

    /** Change password: re-wrap existing MK with a *new* password-derived key */
    async changePassword(oldPassword: string, newPassword: string, newIters?: number): Promise<void> {
        if (!newPassword || newPassword.length < 6) throw new Error('Weak password');
        // Unlock (validates old password)
        await this.unlock(oldPassword);
        if (!this.mkKey) throw new Error('Unlock failed');

        const mkRaw = await crypto.subtle.exportKey('raw', this.mkKey);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iters = newIters ?? 210_000;
        const passKey = await this.derivePasswordKey(newPassword, salt, iters);

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, passKey, mkRaw);

        const header: VaultHeaderV1 = {
            v: 1,
            kdf: { algo: 'PBKDF2', hash: 'SHA-256', iters, salt_b64: b64encode(salt) },
            mk_wrapped_b64: b64encode(wrapped),
            mk_iv_b64: b64encode(iv),
            created_at: Date.now(),
            rotated_at: null,
        };
        localStorage.setItem(VAULT_KEY, JSON.stringify(header));
        this.unlockedAt = Date.now();
        this.unlockedSubject.next(true);
    }

    /* --------------------- Server bundle I/O --------------------- */

    /**
     * Export DB-compatible bundle:
     *   { crypto_version:'v1', kdf_params:{algo,hash,iters}, kdf_salt, eak }
     * where eak = base64( IV(12) || ciphertext+tag )
     */
    exportServerBundleFromHeader(): ServerBundle {
        const raw = localStorage.getItem(VAULT_KEY);
        if (!raw) throw new Error('No vault');
        const h: VaultHeaderV1 = JSON.parse(raw);

        const iv = new Uint8Array(b64decode(h.mk_iv_b64));
        const ct = new Uint8Array(b64decode(h.mk_wrapped_b64));
        const packed = concat(iv, ct);

        return {
            crypto_version: 'v1',
            kdf_params: { algo: h.kdf.algo, hash: h.kdf.hash, iters: h.kdf.iters },
            kdf_salt: h.kdf.salt_b64,
            eak: b64encode(packed),
        };
    }

    /**
     * Import header from server after login and unlock the MK:
     *  - derive PK from password and kdf_salt/iters
     *  - unpack eak (IV||CT) and decrypt MK
     *  - install a fresh *local* header (re-wrap MK with a new IV) for future unlock()
     */
    async importFromServerBundle(bundle: ServerBundle, password: string): Promise<void> {
        if (!bundle?.kdf_salt || !bundle?.eak) throw new Error('Invalid bundle');

        // 1) Derive Password-Key (PK)
        const salt = new Uint8Array(b64decode(bundle.kdf_salt));
        const passKey = await this.derivePasswordKey(password, salt, bundle.kdf_params.iters);

        // 2) Unpack eak: IV || ciphertext+tag
        const packed = new Uint8Array(b64decode(bundle.eak));
        if (packed.byteLength < 12 + 16) throw new Error('EAK too short');
        const iv = packed.slice(0, 12);
        const ct = packed.slice(12);

        // 3) Decrypt MK raw bytes with PK
        const mkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, passKey, ct);

        // 4) Import MK for use
        const mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt','decrypt']);

        // 5) Create/replace the local header with a fresh IV (hygiene)
        const newIv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newIv }, passKey, mkRaw);

        const header: VaultHeaderV1 = {
            v: 1,
            kdf: { algo: 'PBKDF2', hash: 'SHA-256', iters: bundle.kdf_params.iters, salt_b64: bundle.kdf_salt },
            mk_wrapped_b64: b64encode(wrapped),
            mk_iv_b64: b64encode(newIv),
            created_at: Date.now(),
            rotated_at: null,
        };
        localStorage.setItem(VAULT_KEY, JSON.stringify(header));

        // 6) Keep MK in memory
        this.mkKey = mkKey;
        this.unlockedAt = Date.now();
        this.unlockedSubject.next(true);
    }

    /* --------------------- Encryption helpers --------------------- */

    /** Encrypt a UTF-8 string with the MK. Optionally bind AAD (e.g., note id). */
    async encryptText(plain: string, aad?: string): Promise<CipherBlobV1> {
        if (!this.mkKey) throw new Error('Locked');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ad = aad ? TEXT.encode(aad) : undefined;
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad }, this.mkKey, TEXT.encode(plain));
        return {
            v: 1,
            iv_b64: b64encode(iv),
            ct_b64: b64encode(ct),
            aad_b64: ad ? b64encode(ad) : undefined,
        };
        // For API: call packCipherBlob(result) to get base64(IV||CT)
    }

    /** Decrypt to UTF-8 string with the MK. If you used AAD on encrypt, pass the same here. */
    async decryptText(blob: CipherBlobV1 & { aad_b64?: string }): Promise<string> {
        if (!this.mkKey) throw new Error('Locked');
        if (blob.v !== 1) throw new Error('Unsupported blob version');

        const iv = new Uint8Array(b64decode(blob.iv_b64));
        const ad = blob.aad_b64 ? new Uint8Array(b64decode(blob.aad_b64)) : undefined;
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: ad }, this.mkKey, b64decode(blob.ct_b64));
        return UNT.decode(pt);
    }

    /** Encrypt arbitrary bytes with the MK */
    async encryptBytes(bytes: ArrayBuffer, aad?: string): Promise<CipherBlobV1> {
        if (!this.mkKey) throw new Error('Locked');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ad = aad ? TEXT.encode(aad) : undefined;
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad }, this.mkKey, bytes);
        return { v: 1, iv_b64: b64encode(iv), ct_b64: b64encode(ct), aad_b64: ad ? b64encode(ad) : undefined };
    }

    /** Decrypt arbitrary bytes with the MK */
    async decryptBytes(blob: CipherBlobV1): Promise<ArrayBuffer> {
        if (!this.mkKey) throw new Error('Locked');
        if (blob.v !== 1) throw new Error('Unsupported blob version');
        const iv = new Uint8Array(b64decode(blob.iv_b64));
        const ad = blob.aad_b64 ? new Uint8Array(b64decode(blob.aad_b64)) : undefined;
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: ad }, this.mkKey, b64decode(blob.ct_b64));
    }

    /* --------------------- Internals --------------------- */

    private async derivePasswordKey(password: string, salt: Uint8Array, iters: number): Promise<CryptoKey> {
        const baseKey = await crypto.subtle.importKey('raw', TEXT.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt','decrypt']
        );
    }

    /* Optional convenience getters */
    hasVault(): boolean { return !!localStorage.getItem(VAULT_KEY); }
    exportRecoveryHeader(): VaultHeaderV1 {
        const raw = localStorage.getItem(VAULT_KEY);
        if (!raw) throw new Error('No vault');
        return JSON.parse(raw) as VaultHeaderV1;
    }
}
