import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import * as sodium from 'libsodium-wrappers';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';

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

const META_KEY      = 'lock.bundle.meta';       // { saltB64, ivB64, kdf }
const ENABLED_KEY   = 'lock.enabled';


// --- Minimal utils ---
const b64d = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64u = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));

/**
 * Derive PK from password + bundle KDF, then decrypt bundle.eak (AES-GCM).
 * Returns the plaintext EAK as base64 and bytes so you can store/use it freely.
 */
export async function extractPlainEAK(
    userPassword: string,
    serverBundle: ServerBundle
): Promise<{ eakB64: string; eakBytes: Uint8Array; cryptoVersion: string }> {
    if (!userPassword) throw new Error('Password missing');
    if (!serverBundle?.kdf_params?.iters || !serverBundle?.kdf_salt || !serverBundle?.eak) {
        throw new Error('Bundle missing required fields');
    }

    // 1) Derive PK (AES-GCM 256) from password using bundle KDF (PBKDF2/SHA-256)
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(userPassword), 'PBKDF2', false, ['deriveKey']);
    const pk = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt: b64d(serverBundle.kdf_salt),
            iterations: serverBundle.kdf_params.iters,
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
    );

    // 2) Decrypt EAK = AES-GCM( key=PK, iv = first 12 bytes, ct = rest )
    const blob = b64d(serverBundle.eak);
    if (blob.length < 13) throw new Error('Invalid EAK blob');
    const iv = blob.slice(0, 12);
    const ct = blob.slice(12);

    const eakBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, pk, ct);
    const eakBytes = new Uint8Array(eakBuf);
    const eakB64 = b64u(eakBytes);

    return { eakB64, eakBytes, cryptoVersion: serverBundle.crypto_version };
}


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

const BUNDLE_PATH = 'secure/bundle.enc';

async function saveCiphertextToFile(ctBase64: string) {
    await Filesystem.writeFile({
        path: BUNDLE_PATH,
        data: ctBase64,
        directory: Directory.Data, // app-private, not user-visible
        recursive: true,
    });
    await Preferences.set({ key: 'bundle_path', value: BUNDLE_PATH });
}

// Save when user ENABLES app lock
export async function saveWrappedBundle(wrapped: {
    ctB64: string; saltB64: string; ivB64: string; kdf: any
}) {
    await Filesystem.writeFile({
        path: BUNDLE_PATH,
        data: wrapped.ctB64,              // store only ciphertext in file
        directory: Directory.Data,
        recursive: true,
    });
    await Preferences.set({
        key: META_KEY,
        value: JSON.stringify({           // store non-secret metadata
            saltB64: wrapped.saltB64,
            ivB64: wrapped.ivB64,
            kdf: wrapped.kdf
        })
    });
    await Preferences.set({ key: ENABLED_KEY, value: '1' });
}

async function readCiphertextFromFile(): Promise<string | Blob> {
    const { value: path } = await Preferences.get({ key: 'bundle_path' });
    const file = await Filesystem.readFile({
        path: path || BUNDLE_PATH,
        directory: Directory.Data,
    });
    return file.data; // base64
}

/* --------------------- Small helpers --------------------- */
const TEXT = new TextEncoder();
const UNT  = new TextDecoder();

// crypto-wrap.ts — pure Web Crypto (no libsodium)
const enc = new TextEncoder();
const dec = new TextDecoder();

// Derive a 256-bit key from password using PBKDF2-SHA256
async function deriveKey(password: string, saltB64: string, iterations = 300_000) {
    const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function wrapBundleWithPassword_WebCrypto(password: string, bundleJson: string) {
    if (!password) throw new Error('Password missing');
    if (!bundleJson) throw new Error('Bundle JSON missing');

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12)); // GCM nonce
    const saltB64 = btoa(String.fromCharCode(...salt));
    const ivB64   = btoa(String.fromCharCode(...iv));

    const key = await deriveKey(password, saltB64);

    const ctBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(bundleJson)
    );
    const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ctBuf)));

    return { ctB64, saltB64, ivB64, kdf: { alg: 'PBKDF2', hash: 'SHA-256', iters: 300000 } };
}



export async function unwrapBundleWithPassword_WebCrypto(password: string, blob: {
    ctB64: string, saltB64: string, ivB64: string, kdf: { iters: number }
}) {
    const { ctB64, saltB64, ivB64, kdf } = blob;
    const key = await deriveKey(password, saltB64, kdf?.iters ?? 300000);

    const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));

    const ptBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ct
    );
    return new TextDecoder().decode(ptBuf);
}



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

export async function wrapBundleWithPassword(password: string, bundleJson: string) {
    await sodium.ready;
    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
    const opslimit = sodium.crypto_pwhash_OPSLIMIT_MODERATE;
    const memlimit = sodium.crypto_pwhash_MEMLIMIT_MODERATE;

    const key = sodium.crypto_pwhash(
        32, password, salt, opslimit, memlimit, sodium.crypto_pwhash_ALG_ARGON2ID13
    );

    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        sodium.from_string(bundleJson), null, null, nonce, key
    );

    await Preferences.set({ key: 'kdf_salt', value: sodium.to_base64(salt) });
    await Preferences.set({ key: 'kdf_params', value: JSON.stringify({ opslimit, memlimit, alg: 'argon2id13' }) });
    await Preferences.set({ key: 'bundle_wrapped', value: sodium.to_base64(ct) });
    await Preferences.set({ key: 'bundle_nonce', value: sodium.to_base64(nonce) });
    await Preferences.set({ key: 'lock.enabled', value: '1' });
}

// Load when you UNLOCK (this is what you asked about)
export async function loadWrappedBundle(): Promise<{
    ctB64: string; saltB64: string; ivB64: string; kdf: any
}> {
    const metaStr = (await Preferences.get({ key: META_KEY })).value;
    if (!metaStr) throw new Error('No bundle metadata found');
    const { saltB64, ivB64, kdf } = JSON.parse(metaStr);

    const file = await Filesystem.readFile({ path: BUNDLE_PATH, directory: Directory.Data });
    const ctB64 = file.data;
    if (!ctB64) throw new Error('No ciphertext file found');

    // @ts-ignore
    return { ctB64, saltB64, ivB64, kdf }; // ← this is the `wrapped` object
}

async function unwrapBundleWithPassword(password: string): Promise<string> {
    await sodium.ready;
    const saltB64   = (await Preferences.get({ key: 'kdf_salt' })).value!;
    const paramsStr = (await Preferences.get({ key: 'kdf_params' })).value!;
    const ctB64     = (await Preferences.get({ key: 'bundle_wrapped' })).value!;
    const nonceB64  = (await Preferences.get({ key: 'bundle_nonce' })).value!;

    const salt  = sodium.from_base64(saltB64, sodium.base64_variants.ORIGINAL);
    const { opslimit, memlimit } = JSON.parse(paramsStr);
    const key   = sodium.crypto_pwhash(32, password, salt, opslimit, memlimit, sodium.crypto_pwhash_ALG_ARGON2ID13);
    const nonce = sodium.from_base64(nonceB64, sodium.base64_variants.ORIGINAL);
    const ct    = sodium.from_base64(ctB64, sodium.base64_variants.ORIGINAL);

    const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ct, null, nonce, key);
    return sodium.to_string(plain); // JSON string
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

    async derivePKFromBundlePassword(password: string, bundle: ServerBundle): Promise<CryptoKey> {

        const b64d = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

        if (!password) throw new Error('Password missing');
        if (!bundle?.kdf_params?.iters || !bundle?.kdf_salt) throw new Error('Bundle KDF params/salt missing');

        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                hash: 'SHA-256',
                salt: b64d(bundle.kdf_salt),
                iterations: bundle.kdf_params.iters,
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
    }

    private eakBytes: Uint8Array | null = null;
    private eakB64: string | null = null;

    // Base64 helpers
    private b64d(s: string): Uint8Array {
        const bin = atob(s);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    private zeroize(buf: Uint8Array | null) {
        if (!buf) return;
        for (let i = 0; i < buf.length; i++) buf[i] = 0;
    }


    /**
     * Import plaintext EAK (base64). Keeps it ONLY in RAM.
     * Call this after you’ve unwrapped the EAK from the server bundle.
     */
    async importEAK(eakB64: string): Promise<void> {
        if (typeof eakB64 !== 'string' || !eakB64.length) {
            throw new Error('EAK missing');
        }

        // Decode and basic sanity check
        const bytes = this.b64d(eakB64);
        if (bytes.length < 16) throw new Error('EAK too short'); // adjust if you know exact length

        // Zeroize any previous EAK before replacing
        this.zeroize(this.eakBytes);

        // Store in memory
        this.eakBytes = bytes;
        this.eakB64 = eakB64;
        this.unlockedAt = Date.now();

        // after you compute `bytes` from eakB64 and sanity-check length:
        this.mkKey = await crypto.subtle.importKey(
            'raw',
            bytes,                 // 32 bytes for AES-256
            'AES-GCM',
            false,
            ['encrypt','decrypt']
        );


        // If your app derives other working keys from EAK, do it here and keep those in RAM too.
        // Example (pseudo):
        // this.noteKEK = await hkdfSha256(this.eakBytes, info="note-kek");
        // this.attachmentKEK = await hkdfSha256(this.eakBytes, info="att-kek");
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

    async createVault(password: string, iters = 210_000): Promise<void> {
        if (!password || password.length < 6) {
            throw new Error('Weak password');
        }

        // 1) Derive Password-Key (PK) via PBKDF2(SHA-256)
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const baseKey = await crypto.subtle.importKey('raw', TEXT.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
        const passKey = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt','decrypt']
        );

        // 2) Generate random 32-byte Master Key (MK)
        const mkRaw = crypto.getRandomValues(new Uint8Array(32)).buffer;
        const mkKey = await crypto.subtle.importKey('raw', mkRaw, 'AES-GCM', true, ['encrypt','decrypt']);

        // 3) Wrap MK with PK using AES-GCM
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, passKey, mkRaw);

        // 4) Persist local header (no plaintext secrets)
        const header = {
            v: 1 as const,
            kdf: { algo: 'PBKDF2' as const, hash: 'SHA-256' as const, iters, salt_b64: b64encode(salt) },
            mk_wrapped_b64: b64encode(wrapped),
            mk_iv_b64: b64encode(iv),
            created_at: Date.now(),
            rotated_at: null as number | null,
        };
        localStorage.setItem(VAULT_KEY, JSON.stringify(header));

        // 5) Keep MK in memory (service-wide) so encrypt/decrypt work immediately
        this.mkKey = mkKey;
        this.unlockedAt = Date.now();
        // @ts-ignore
        if (this['unlockedSubject']?.next) this['unlockedSubject'].next(true);
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
