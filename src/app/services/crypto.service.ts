import { Injectable } from '@angular/core';
import {at} from "ionicons/icons";
declare var require: any;
var CryptoJS = require('crypto-js');
@Injectable({
  providedIn: 'root'
})
export class CryptoService {

  constructor() { }
  public encrypt(value: any, password: string) {
    // returns the encrypted value in BASE64 encoded.
    let encrypted = CryptoJS.AES.encrypt(value, password).toString();
    return encrypted;
  }

  public decrypt(value: any, password: string) {
    let decrypted = CryptoJS.AES.decrypt(value, password).toString(CryptoJS.enc.Utf8);
    return decrypted;
  }

}
