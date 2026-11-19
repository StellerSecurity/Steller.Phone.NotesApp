import {Injectable} from '@angular/core';

declare var require: any;
var CryptoJS = require('crypto-js');
@Injectable({
  providedIn: 'root'
})
export class CryptoService {

  constructor() { }
  public encrypt(value: any, password: string) {
    // returns the encrypted value in BASE64 encoded.
    return CryptoJS.AES.encrypt(value, password).toString();
  }

  public decrypt(value: any, password: string) {
    if (value === '') return '';
    const padding = {
      unpad(data: any) {
        const bytes = data.sigBytes;
        if (!bytes || bytes % 16 !== 0) throw new Error('invalidCiphertext');
        const size = (data.words[(bytes - 1) >>> 2] >>> (24 - ((bytes - 1) % 4) * 8)) & 255;
        if (size < 1 || size > 16 || size > bytes) throw new Error('invalidCiphertext');
        for (let index = bytes - size; index < bytes; index++) {
          const byte = (data.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 255;
          if (byte !== size) throw new Error('invalidCiphertext');
        }
        CryptoJS.pad.Pkcs7.unpad(data);
      }
    };
    return CryptoJS.AES.decrypt(value, password, { padding }).toString(CryptoJS.enc.Utf8);
  }

}
