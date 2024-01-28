import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PasswordHelperService {
  constructor() { }
  public strongEnough(password: string) {

    if(password.length < 6) {
      return 405;
    }

    return 200;

  }

}
