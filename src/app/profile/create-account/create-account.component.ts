import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-account',
  templateUrl: './create-account.component.html',
  styleUrls: ['./create-account.component.scss'],
})
export class CreateAccountComponent {
  email = '';
  password = '';
  showPassword = false;
  showVerificationSection = false;
  otpValue = '';
  otpConfig = {
    length: 4,
    inputClass: 'bottom-border-otp', // must match your CSS class
    allowNumbersOnly: false,
    isPasswordInput: false,
    disableAutoFocus: false,
    placeholder: ' ',
  };

  constructor(private router: Router) {}

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  createAccount() {
    // Simulate API call and show verification
    this.showVerificationSection = true;
  }

  goToLogin() {
    this.router.navigate(['/profile/login']);
  }

  resendCode() {
    console.log('Resend code to:', this.email);
  }

  changeEmail() {
    this.showVerificationSection = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;
  }
  
  
}
