import { CryptoService } from './crypto.service';
declare const require: any;
const CryptoJS = require('crypto-js');

describe('Legacy password ciphertext validation', () => {
  const service = new CryptoService();
  it('opens existing CryptoJS ciphertext without changing content or whitespace', () => {
    for (const text of ['', 'Title', '<p><br></p><p>Æøå 🌍 中文</p><p><br></p>', '  text\n\n']) {
      const cipher = CryptoJS.AES.encrypt(text, 'synthetic-code').toString();
      expect(service.decrypt(cipher, 'synthetic-code')).toBe(text);
    }
    expect(service.decrypt('', 'synthetic-code')).toBe('');
  });
  it('rejects absent, excessive and inconsistent padding instead of returning garbage', () => {
    for (const hex of ['00000000000000000000000000000000', '00000000000000000000000000000011', '41414141414141414141414141030203']) {
      const cipher = CryptoJS.AES.encrypt(CryptoJS.enc.Hex.parse(hex), 'synthetic-code', { padding: CryptoJS.pad.NoPadding }).toString();
      expect(() => service.decrypt(cipher, 'synthetic-code')).toThrowError('invalidCiphertext');
    }
  });
  it('rejects a truncated ciphertext', () => {
    const cipher = CryptoJS.AES.encrypt('Keep this note', 'synthetic-code').toString();
    expect(() => service.decrypt(cipher.slice(0, -8), 'synthetic-code')).toThrow();
  });
});
