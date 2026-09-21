import { finalize } from 'rxjs';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';
import { AppHapticsService } from 'src/app/services/app-haptics.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit {
  showVerification = false;
  otpValue = '';
  otpConfig = {
    length: 6,
    inputClass: 'bottom-border-otp', // must match your CSS class
    allowNumbersOnly: true,
    isPasswordInput: false,
    disableAutoFocus: false,
    placeholder: ' ',
  };
  forgotPasswordForm: FormGroup;
  isProcessing = false;
  private resendAllowedAt = 0;

  constructor(private fb: FormBuilder, private authService: AuthService,
    private toastMessageService: ToastMessageService,
    private router: Router,
    private appHaptics: AppHapticsService) {

  }

  ngOnInit(): void {
    this.initForgotPasswordForm();
  }

  initForgotPasswordForm(): void {
    this.forgotPasswordForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
    });
  }

  async sendCode() {
    if (this.isProcessing) return;
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.markAllAsTouched();
      await this.appHaptics.warning();
      return;
    }
    if (Date.now() < this.resendAllowedAt) {
      await this.toastMessageService.showError('waitBeforeResend', undefined, true);
      return;
    }
    this.isProcessing = true;
    this.authService.forgotPassword(this.forgotPasswordForm.get('email')?.value)
      .pipe(finalize(() => { this.isProcessing = false; })).subscribe({
        next: response => {
          if (response.response_code == 200) {
            this.appHaptics.success();
            this.otpValue = '';
            this.resendAllowedAt = Date.now() + 30000;
            this.showVerification = true;
          } else {
            this.toastMessageService.showError(response.response_message);
          }
        },
        error: () => { this.toastMessageService.showError('accountRequestFailed', undefined, true); }
      });
  }

  resendCode() {
    this.appHaptics.tap();
    this.sendCode();
  }

  useDifferentEmail() {
    if (this.isProcessing) return;
    this.appHaptics.selectionChanged();
    this.otpValue = '';
    this.showVerification = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;

    if(this.showVerification && !this.isProcessing && this.forgotPasswordForm.valid && /^\d{6}$/.test(this.otpValue)) {
      this.appHaptics.success();
      this.router.navigate(['/profile/create-new-password'], {
        queryParams: {
          confirmationCode: this.otpValue,
          email: this.forgotPasswordForm.get('email')?.value
        }
      })
    }
  }
}
