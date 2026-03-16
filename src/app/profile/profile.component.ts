import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { SecureStorageService } from '../services/secure-storage.service';
import { DataService } from "../services/data.service";
import { AuthService } from '../services/auth.service';
import { TranslatorService } from '../services/translator.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent  {
  user: any = {};
  isLoggedIn = false;
  isLoading= true;

  constructor(
    private router: Router,
    private alertController: AlertController,
    private secureStorageService: SecureStorageService,
    private dataService: DataService,
    public authService: AuthService,
    private translatorService: TranslatorService
  ) {}

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
    this.isLoading = false;
  }

  goToSettings() {
    this.router.navigate(['/app-settings']);
  }

  async confirmLogout() {
    const alert = await this.alertController.create({
      header: this.translatorService.allTranslations?.confirmLogout ?? 'Confirm Logout',
      message: this.translatorService.allTranslations?.confirmLogoutMessage ?? 'Are you sure you want to logout?',
      buttons: [
        {
          text: this.translatorService.allTranslations?.cancel ?? 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
        },
        {
          text: this.translatorService.allTranslations?.logout ?? 'Logout',
          handler: () => {
            this.logout();
          },
        },
      ],
    });

    await alert.present();
  }

  private async logout() {
    await this.dataService.clearAppData();
    await this.router.navigateByUrl('/', { replaceUrl: true });
  }

  navigateToRegister() {
    this.router.navigate(['/profile/create-account']);
  }

  goToLogin() {
    this.router.navigate(['/profile/login']);
  }

  goToDeleteAccount() {
    this.router.navigate(['/profile/delete-account']);
  }

  openPrivacyPolicy() {
    window.open('https://stellarsecurity.com/privacy-page', '_blank');
  }

  openTermsPage() {
    window.open('https://stellarsecurity.com/terms-page', '_blank');
  }

  openContactUs() {
    window.open('https://stellarsecurity.com/contact-us', '_blank');
  }
}

