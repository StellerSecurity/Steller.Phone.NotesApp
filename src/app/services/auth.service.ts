import { Injectable } from '@angular/core';
import {BehaviorSubject, firstValueFrom, Observable, timeout} from 'rxjs';
import { loginDto } from '../constants/models/authDto';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import { auth, baseUrl } from '../constants/api/product.api';
import { SecureStorageService } from './secure-storage.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private loggedInSubject = new BehaviorSubject<boolean>(false);

  public readonly loginState$ = this.loggedInSubject.asObservable();

  constructor(private http: HttpClient, private secureStorageService: SecureStorageService) {
    this.initializeAuthState();
  }

  get isLoggedIn(): boolean {
    return this.loggedInSubject.value;
  }

  async initializeAuthState() {
    const token = await this.secureStorageService.getItem('ssToken');
    this.loggedInSubject.next(!!token);
  }

  clearAuthenticationState(): void {
    this.loggedInSubject.next(false);
  }

  createAccount(data: loginDto): Observable<any> {
    return this.http.post<any>(baseUrl + auth.createAcc, data).pipe(timeout(15000));
  }

  loginHandling(data: loginDto): Observable<any> {
    return this.http.post<any>(baseUrl + auth.loginAcc, data).pipe(timeout(15000));
  }

  async updateEak(payload: {
    crypto_version: string;
    kdf_params: {
      algo: string;
      hash: string;
      iters: number;
    };
    kdf_salt: string;
    eak: string;
  }): Promise<any> {
    const TOKEN = await this.secureStorageService.getItem('ssToken');
    const headers = new HttpHeaders().set('Authorization', `Bearer ${TOKEN ?? ''}`);

    return firstValueFrom(
      this.http.patch<any>(baseUrl + auth.updateEak, payload, { headers }).pipe(timeout(15000))
    );
  }

  forgotPassword(email: any): Observable<any> {
    return this.http.post<any>(baseUrl + auth.forgotPassword, { email }).pipe(timeout(15000));
  }

  resetPassword(data: any): Observable<any> {
    return this.http.post<any>(baseUrl + auth.resetPasswordUrl, data).pipe(timeout(15000));
  }

  async buildAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.secureStorageService.getItem('ssToken');
    return new HttpHeaders().set('Authorization', `Bearer ${token ?? ''}`);
  }

  deleteAccount(currentPassword: string): Observable<any> {
    return new Observable<any>((subscriber) => {
      this.buildAuthHeaders()
        .then((headers) => {
          this.http
            .post<any>(baseUrl + auth.deleteUser, { current_password: currentPassword }, { headers }).pipe(timeout(15000))
            .subscribe({
              next: (response) => {
                subscriber.next(response);
                subscriber.complete();
              },
              error: (error) => subscriber.error(error),
            });
        })
        .catch((error) => subscriber.error(error));
    });
  }
}
