import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SecureStorageService } from '../services/secure-storage.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  user: any = {};
  isLoggedIn = false;

  constructor(private router: Router,
    private secureStorageService: SecureStorageService) {}

  ngOnInit() {
    // runs only once when component is initialized
    this.loadUserData();
  }

  ionViewWillEnter() {
    // runs every time user navigates to this page
    this.loadUserData();
  }

  private async  loadUserData() {
    const user = await this.secureStorageService.getItem('ssUser');
    if(user) {
      this.user = JSON.parse(user);
    }
    const token = await this.secureStorageService.getItem('ssToken');
    this.isLoggedIn = !!token;
  }

  goToSettings() {
    this.router.navigate(['/app-settings']);
  }

  logout() {
    this.secureStorageService.removeItem('ssToken');
    this.secureStorageService.removeItem('ssUser');
    this.isLoggedIn = false;
    this.user = {};
    // this.router.navigate(['/profile/login']); // redirect after logout
  }

  navigateToRegister() {
    this.router.navigate(['/profile/create-account']);
  }

  goToLogin() {
    this.router.navigate(['/profile/login']);
  }
}
