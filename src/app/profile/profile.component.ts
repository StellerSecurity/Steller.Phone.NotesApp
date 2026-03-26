import { Component } from '@angular/core';
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
  isLoading = true;
  showAccountName = false;
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
    this.showAccountName = false;
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
  get maskedAccountName(): string {
    const email = (this.user?.email ?? '').trim();
    if (!email) {
      return '••••••••';
    }
    const parts = email.split('@');
    if (parts.length !== 2) {
      return '••••••••';
    }
    const [localPart, domainPart] = parts;
    const domainSections = domainPart.split('.');
    const domainName = domainSections[0] ?? '';
    const domainSuffix = domainSections.slice(1).join('.');
    const mask = (value: string, visible = 1): string => {
      if (!value) {
        return '••••';
      }
      if (value.length <= visible) {
        return value + '••••';
      }
      return value.slice(0, visible) + '•'.repeat(Math.max(value.length - visible, 3));
    };
    const maskedLocal = mask(localPart, 1);
    const maskedDomain = mask(domainName, 1);
    return domainSuffix
      ? `${maskedLocal}@${maskedDomain}.${domainSuffix}`
      : `${maskedLocal}@${maskedDomain}`;
  }
  toggleAccountNameVisibility(event?: Event) {
    event?.stopPropagation();
    this.appHaptics.selectionChanged();
    this.showAccountName = !this.showAccountName;
  }
  goToSettings() {
    this.router.navigate(['/app-settings']);
  }
  goToAbout() {
    this.router.navigate(['/profile/about']);
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
    this.router.navigate(['/profile/create-account']);
  }
  goToLogin() {
    this.router.navigate(['/profile/login']);
  }
}
