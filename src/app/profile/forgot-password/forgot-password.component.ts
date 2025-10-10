import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/services/auth.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit {
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
  forgotPasswordForm: FormGroup;
  isProcessing = false;

  constructor(private fb: FormBuilder, private authService: AuthService,
    private toastMessageService: ToastMessageService) {

  }

  ngOnInit(): void {
    this.initForgotPasswordForm();
  }

  initForgotPasswordForm(): void {
    this.forgotPasswordForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
    });
  }

  sendCode() {
    if (this.forgotPasswordForm.valid) {
      this.isProcessing = true;
      this.authService.forgotPassword(this.forgotPasswordForm.get('email')?.value).subscribe({
        next: (response) => {
          this.isProcessing = false;
          if (response.response_code == 200) {
            this.showVerification = true;        
          } else {
            this.toastMessageService.showError(response.response_message);
          }
        },
        error: (error) => {
          this.isProcessing = false;
          this.toastMessageService.showError(error?.error?.message);
        }
      })
    }
  }

  resendCode() {
    this.sendCode();
  }

  useDifferentEmail() {
    this.showVerification = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;
  }
}
