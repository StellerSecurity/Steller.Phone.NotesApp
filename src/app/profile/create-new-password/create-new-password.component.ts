import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-new-password',
  templateUrl: './create-new-password.component.html',
  styleUrls: ['./create-new-password.component.scss'],
})
export class CreateNewPasswordComponent {
  newPassword = '';
  confirmPassword = '';
  showNewPassword = false;
  showConfirmPassword = false;

  constructor(private router: Router) {}

  toggleNewPasswordVisibility() {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPasswordVisibility() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  confirm() {
    if (this.newPassword !== this.confirmPassword) {
      console.error('Passwords do not match.');
      return;
    }

    console.log('New password confirmed:', this.newPassword);
    // Send to backend API
  }

  backToLogin() {
    this.router.navigate(['/profile/login']);
  }
}
