import { Component } from '@angular/core';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent {
  email = '';
  showVerification = false;
  verificationCode: string[] = ['', '', '', ''];

  sendCode() {
    // Optionally call API to send code to this.email
    this.showVerification = true;
  }

  resendCode() {
    console.log('Resend code to', this.email);
  }

  useDifferentEmail() {
    this.showVerification = false;
    this.verificationCode = ['', '', '', ''];
  }

  handleCodeInput(event: any, index: number) {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    if (!/^[0-9]$/.test(value)) {
      input.value = '';
      this.verificationCode[index] = '';
      return;
    }

    this.verificationCode[index] = value;

    if (index < 3) {
      const nextInput = input.nextElementSibling as HTMLInputElement;
      if (nextInput) nextInput.focus();
    } else {
      const code = this.verificationCode.join('');
      console.log('Submit code:', code);
    }
  }

  handleKeyDown(event: KeyboardEvent, index: number) {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Backspace' && !input.value && input.previousElementSibling) {
      (input.previousElementSibling as HTMLInputElement).focus();
    }
  }
}
