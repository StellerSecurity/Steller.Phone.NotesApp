import { Component } from '@angular/core';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent {
  email = '';
  showVerification = false;
  otpValue = '';
  otpConfig = {
    length: 4,
    inputClass: 'bottom-border-otp', // must match your CSS class
    allowNumbersOnly: false,
    isPasswordInput: false,
    disableAutoFocus: false,
    placeholder: ' ',
  };

  sendCode() {
    // Optionally call API to send code to this.email
    this.showVerification = true;
  }

  resendCode() {
    console.log('Resend code to', this.email);
  }

  useDifferentEmail() {
    this.showVerification = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;
  }
}
