import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { loginDto } from 'src/app/constants/models/authDto';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  showPassword = false;
  loginForm: FormGroup;
  isSaving = false;

  constructor(private router: Router, private fb: FormBuilder, private authService: AuthService) {}


  ngOnInit(): void {
    this.initLoginForm();
  }

  initLoginForm(): void {
    this.loginForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required]],
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  login() {
    if (this.loginForm.valid) {
      this.isSaving = true;
      const loginObj: loginDto = {
        username: this.loginForm.get("email")?.value,
        password: this.loginForm.get("password")?.value,
      };

      this.authService.loginHandling(loginObj).subscribe({
        next: (response:any) => {
          this.isSaving = false;
          if (response.response_code == 200) {
            // this.localStorageService.storeToLocalStorage("ssToken", response.token);
            // this.toastrService.success(this.translatorService.allTranslations.loggedInSuccessfully);
            this.router.navigate(["/"]);
          } else {
            // this.toastrService.error(response.response_message);
          }
        },
        error: (error) => {
          this.isSaving = false;
          // this.toastrService.error(error?.error?.message);
        },
      });
    }
  }

  navigateToRegister() {
    this.router.navigate(['/profile/create-account']);
  }

  forgotPassword() {
    this.router.navigate(['/profile/forgot-password']);
  }
}
