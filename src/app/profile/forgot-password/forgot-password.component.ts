import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent {
  email = '';

  constructor(private router: Router) {}

  sendCode() {
    console.log('Sending code to:', this.email);
    // Trigger backend/email verification logic
  }

  backToLogin() {
    this.router.navigate(['/login']);
  }
}
