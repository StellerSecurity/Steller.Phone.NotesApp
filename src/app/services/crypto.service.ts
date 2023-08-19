import { Injectable } from '@angular/core';
declare var require: any;
var CryptoJS = require('crypto-js');
@Injectable({
  providedIn: 'root'
})
export class CryptoService {

  constructor() { }
  public encrypt(value: any, password: string) {
    let encrypted = CryptoJS.AES.encrypt(value, password);
    return encrypted;
  }

  public decrypt(value: any, password: string) {
    let decrypted = CryptoJS.AES.decrypt(value, password).toString(CryptoJS.enc.Utf8);
    return decrypted;
  }

}
