export const BACKUP_MEMORY = 256 * 1024 * 1024;
export const BACKUP_PASSES = 3;
export const MAX_BACKUP_TEXT = 48 * 1024 * 1024;
export const MAX_PLAIN_BYTES = 32 * 1024 * 1024;
export function backupCode(value: string): string {
  const code = typeof value === 'string' ? value.replace(/[ -]/g, '') : '';
  if (!/^[0-9]{30}$/.test(code)) throw new Error('backupCodeInvalid');
  return code;
}
export function generateBackupCode(): string {
  let result = '';
  while (result.length < 30) {
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    for (const byte of bytes) if (byte < 250 && result.length < 30) result += String(byte % 10);
    bytes.fill(0);
  }
  return result;
}
export function validateBackupPayload(data: any): any {
  const invalid = () => { throw new Error('backupInvalid'); };
  if (!data || data.format !== 'stellar-notes-export' || data.version !== 1 || !Array.isArray(data.notes) || !Array.isArray(data.folders)
    || data.notes.length > 10000 || data.folders.length > 10000) invalid();
  const string = (v: any, max = MAX_PLAIN_BYTES) => typeof v === 'string' && v.length <= max;
  const ids = new Set<string>(), folders = new Set<string>();
  for (const folder of data.folders) {
    if (!folder || !string(folder.id, 256) || !folder.id || folders.has(folder.id) || !string(folder.name, 4096)
      || typeof folder.deleted !== 'boolean' || !Number.isFinite(folder.lastModified)) invalid();
    folders.add(folder.id);
  }
  for (const note of data.notes) {
    if (!note || !string(note.id, 256) || !note.id || ids.has(note.id) || !string(note.folder, 4096)
      || (note.folderId !== null && !string(note.folderId, 256)) || typeof note.locked !== 'boolean'
      || !['pinned','favorite','deleted'].every(key => typeof note[key] === 'boolean') || !Number.isFinite(note.lastModified)
      || (note.deletedAt !== null && !Number.isFinite(note.deletedAt))) invalid();
    if (note.locked) {
      if (!note.encrypted || note.encrypted.format !== 'cryptojs-aes-passphrase' || !string(note.encrypted.title) || !string(note.encrypted.html)) invalid();
    } else if (!string(note.title) || !string(note.html)) invalid();
    ids.add(note.id);
  }
  return data;
}
export function parseBackupEnvelope(text: string): any {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_TEXT) throw new Error('backupInvalid');
  let value: any;
  try { value = JSON.parse(text); } catch { throw new Error('backupInvalid'); }
  if (!value || value.format !== 'stellar-notes-backup' || value.version !== 1 || value.kdf !== 'argon2id13'
    || value.memlimit !== BACKUP_MEMORY || value.opslimit !== BACKUP_PASSES || value.cipher !== 'xchacha20poly1305-ietf'
    || typeof value.salt !== 'string' || value.salt.length !== 24 || typeof value.nonce !== 'string' || value.nonce.length !== 32
    || typeof value.ciphertext !== 'string' || value.ciphertext.length < 24 || ![value.salt,value.nonce,value.ciphertext].every(s=>/^[A-Za-z0-9+/]+={0,2}$/.test(s))) throw new Error('backupInvalid');
  return value;
}
export function backupHeader(value: any): string {
  return JSON.stringify({format:'stellar-notes-backup',version:1,kdf:'argon2id13',memlimit:BACKUP_MEMORY,opslimit:BACKUP_PASSES,
    cipher:'xchacha20poly1305-ietf',salt:value.salt,nonce:value.nonce});
}
