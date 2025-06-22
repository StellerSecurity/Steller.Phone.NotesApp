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
  verificationCode: string[] = ['', '', '', ''];

  constructor(private router: Router) {}

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  createAccount() {
    // Simulate API call and show verification
    this.showVerificationSection = true;
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  resendCode() {
    console.log('Resend code to:', this.email);
  }

  changeEmail() {
    this.showVerificationSection = false;
  }

  handleCodeInput(event: any, index: number) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
  
    // Allow only digits
    if (!/^[0-9]$/.test(value)) {
      input.value = '';
      this.verificationCode[index] = '';
      return;
    }
  
    this.verificationCode[index] = value;
  
    // Move to next input
    const nextInput = input.nextElementSibling as HTMLInputElement;
    if (nextInput && value) {
      nextInput.focus();
    }
  }

  handleKeyDown(event: KeyboardEvent, index: number) {
    const input = event.target as HTMLInputElement;
  
    // On backspace, move to previous input
    if (event.key === 'Backspace' && !input.value && input.previousElementSibling) {
      (input.previousElementSibling as HTMLInputElement).focus();
    }
  }
  
  
}
