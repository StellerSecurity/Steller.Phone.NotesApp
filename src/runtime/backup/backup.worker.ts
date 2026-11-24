import sodium from 'libsodium-wrappers-sumo';
import { BACKUP_MEMORY, BACKUP_PASSES, MAX_PLAIN_BYTES, backupCode, backupHeader, parseBackupEnvelope, validateBackupPayload } from './backup-format';
const scope = globalThis as any;
scope.onmessage = async ({data}: MessageEvent) => {
  let key: Uint8Array | undefined, password: Uint8Array | undefined, plain: Uint8Array | undefined;
  let response: any;
  try {
    const code = backupCode(data.code);
    const envelope = data.op === 'decrypt' ? parseBackupEnvelope(data.text) : null;
    if (!['encrypt','decrypt'].includes(data.op)) throw new Error('backupInvalid');
    await sodium.ready;
    password = new TextEncoder().encode(code); data.code = null;
    const b64 = sodium.base64_variants.ORIGINAL;
    const salt = envelope ? sodium.from_base64(envelope.salt, b64) : sodium.randombytes_buf(16);
    const nonce = envelope ? sodium.from_base64(envelope.nonce, b64) : sodium.randombytes_buf(24);
    if (salt.length !== 16 || nonce.length !== 24 || (envelope && (sodium.to_base64(salt,b64)!==envelope.salt || sodium.to_base64(nonce,b64)!==envelope.nonce))) throw new Error('backupInvalid');
    key = sodium.crypto_pwhash(32, password, salt, BACKUP_PASSES, BACKUP_MEMORY, sodium.crypto_pwhash_ALG_ARGON2ID13);
    const header = backupHeader({salt:sodium.to_base64(salt,b64),nonce:sodium.to_base64(nonce,b64)});
    if (data.op === 'encrypt') {
      if (typeof data.text !== 'string') throw new Error('backupInvalid');
      plain = new TextEncoder().encode(data.text); data.text = null;
      if (plain.length > MAX_PLAIN_BYTES) throw new Error('backupTooLarge');
      validateBackupPayload(JSON.parse(new TextDecoder().decode(plain)));
      const encrypted = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plain, header, null, nonce, key);
      response = {ok:true,text:JSON.stringify({...JSON.parse(header),ciphertext:sodium.to_base64(encrypted,b64)})};
    } else {
      try { plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null,sodium.from_base64(envelope.ciphertext,b64),header,nonce,key); }
      catch { throw new Error('backupUnlockFailed'); }
      if (plain.length > MAX_PLAIN_BYTES) throw new Error('backupTooLarge');
      const text = new TextDecoder('utf-8',{fatal:true}).decode(plain);
      validateBackupPayload(JSON.parse(text)); response = {ok:true,text};
    }
  } catch (error: any) {
    response = {ok:false,error:['backupInvalid','backupCodeInvalid','backupTooLarge','backupUnlockFailed'].includes(error?.message)?error.message:'backupCryptoFailed'};
  } finally {
    if (key) sodium.memzero(key); if (password) sodium.memzero(password); if (plain) sodium.memzero(plain);
  }
  scope.postMessage(response); scope.close();
};
