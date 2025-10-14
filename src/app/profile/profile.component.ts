import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { SecureStorageService } from '../services/secure-storage.service';
import { DataService } from "../services/data.service";

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent implements OnInit {
  user: any = {};
  isLoggedIn = false;

  constructor(
    private router: Router,
    private alertController: AlertController,
    private secureStorageService: SecureStorageService,
    private dataService: DataService
  ) {}

  ngOnInit() {
    this.loadUserData();
  }

  ionViewWillEnter() {
    this.loadUserData();
  }

  private async loadUserData() {
    const user = await this.secureStorageService.getItem('ssUser');
    if (user) {
      this.user = JSON.parse(user);
    }
    const token = await this.secureStorageService.getItem('ssToken');
    this.isLoggedIn = !!token;
  }

  goToSettings() {
    this.router.navigate(['/app-settings']);
  }

  async confirmLogout() {
    const alert = await this.alertController.create({
      header: 'Confirm Logout',
      message: 'Are you sure you want to logout?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
        },
        {
          text: 'Logout',
          handler: () => {
            this.logout();
          },
        },
      ],
    });

    await alert.present();
  }

  private logout() {
    this.dataService.clearAppData();
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
