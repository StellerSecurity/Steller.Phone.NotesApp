import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { loginDto, signupDto } from '../constants/models/authDto';
import { HttpClient } from '@angular/common/http';
import { auth, baseUrl } from '../constants/api/product.api';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(private http:HttpClient) { }

  createAccount(data:loginDto):Observable<any>{
    return this.http.post<any>(baseUrl + auth.createAcc, data)

  }

  loginHandling(data:loginDto):Observable<any>{
    return this.http.post<any>(baseUrl + auth.loginAcc, data)
  }

  forgotPassword(email:any): Observable<any> {
    return this.http.post<any>(baseUrl + auth.forgotPassword, {email});
  }

  resetPassword(data: any): Observable<any> {
    return this.http.post<any>(baseUrl + auth.resetPasswordUrl, data);
  }
}
