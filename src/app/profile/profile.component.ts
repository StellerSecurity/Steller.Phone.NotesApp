import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { SecureStorageService } from '../services/secure-storage.service';
import { DataService } from "../services/data.service";
import { AuthService } from '../services/auth.service';
import { TranslatorService } from '../services/translator.service';
import { AppHapticsService } from '../services/app-haptics.service';

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
    private translatorService: TranslatorService,
    private appHaptics: AppHapticsService,
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
    this.appHaptics.tap();
    this.router.navigate(['/app-settings']);
  }

  async confirmLogout() {
    await this.appHaptics.warning();
    const alert = await this.alertController.create({
      header: this.translatorService.allTranslations?.confirmLogout ?? 'Confirm Logout',
      message: this.translatorService.allTranslations?.confirmLogoutMessage ?? 'Are you sure you want to logout?',
      buttons: [
        {
          text: this.translatorService.allTranslations?.cancel ?? 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
          handler: () => {
            this.appHaptics.tap();
          },
        },
        {
          text: this.translatorService.allTranslations?.logout ?? 'Logout',
          handler: () => {
            this.appHaptics.success();
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
    this.appHaptics.tap();
    this.router.navigate(['/profile/create-account']);
  }

  goToLogin() {
    this.appHaptics.tap();
    this.router.navigate(['/profile/login']);
  }

  goToDeleteAccount() {
    this.appHaptics.tap();
    this.router.navigate(['/profile/delete-account']);
  }

  openPrivacyPolicy() {
    this.appHaptics.tap();
    window.open('https://stellarsecurity.com/privacy-page', '_blank');
  }

  openTermsPage() {
    this.appHaptics.tap();
    window.open('https://stellarsecurity.com/terms-page', '_blank');
  }

  openContactUs() {
    this.appHaptics.tap();
    window.open('https://stellarsecurity.com/contact-us', '_blank');
  }
}

