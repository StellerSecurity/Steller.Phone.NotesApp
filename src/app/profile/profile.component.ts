import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  user: any = {};
  isLoggedIn = false;

  constructor(private router: Router) {}

  ngOnInit() {
    // runs only once when component is initialized
    this.loadUserData();
  }

  ionViewWillEnter() {
    // runs every time user navigates to this page
    this.loadUserData();
  }

  private loadUserData() {
    this.user = JSON.parse(localStorage.getItem('ssUser') || '{}');
    this.isLoggedIn = !!localStorage.getItem('ssToken');
  }

  goToSettings() {
    this.router.navigate(['/app-settings']);
  }

  logout() {
    localStorage.removeItem('ssToken');
    localStorage.removeItem('ssUser');
    this.isLoggedIn = false;
    this.user = {};
    // this.router.navigate(['/profile/login']); // redirect after logout
  }

  goToLogin() {
    this.router.navigate(['/profile/login']);
  }
}
