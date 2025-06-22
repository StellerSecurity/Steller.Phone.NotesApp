import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-account',
  templateUrl: './create-account.component.html',
  styleUrls: ['./create-account.component.scss'],
})
export class CreateAccountComponent {
  showPassword = false;
  email = '';
  password = '';

  constructor(private router: Router) {}

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  createAccount() {
    console.log('Creating account with:', this.email, this.password);
    // Add API integration here
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
