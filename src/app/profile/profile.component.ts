import { identityCopy } from './identity-copy';
import { NotesService } from '../services/notes.service';
import { SyncWorkerService } from '../services/sync-worker.service';
import { OutboxStorage } from '../services/outbox-storage.service';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
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
export class ProfileComponent {
  user: any = {};
  isLoggedIn = false;
  isLoading = true;
  showAccountName = false;
  logoutOpen = false;
  logoutBlocked = false;
  logoutBusy = false;

  readonly desktopDownloadUrls = {
    windows: 'https://stellarsecurity.com/download/platform/windows?top=notes',
    linux: 'https://stellarsecurity.com/download/platform/linux?top=notes',
    mac: 'https://stellarsecurity.com/download/platform/mac?top=notes',
  };

  constructor(
    private router: Router,
    private secureStorageService: SecureStorageService,
    private dataService: DataService,
    public authService: AuthService,
    private translatorService: TranslatorService,
    private appHaptics: AppHapticsService,
    private notesService: NotesService,
    private outbox: OutboxStorage,
    private syncWorker: SyncWorkerService,
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

    await this.authService.initializeAuthState();
    this.isLoggedIn = this.authService.isLoggedIn;
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

  openDesktopNotes(event: Event, url: string) {
    event.stopPropagation();
    this.appHaptics.tap();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  get securityTitle(): string { return identityCopy(this.translatorService.language).title; }

  goToSecurity() { this.router.navigate(['/profile/security']); }

  goToSettings() {
    this.router.navigate(['/app-settings']);
  }

  goToAbout() {
    this.router.navigate(['/profile/about']);
  }

  get dialogCopy() {
    const t = this.translatorService.allTranslations;
    return { title: this.logoutBlocked ? 'Notes not synced' : (t?.confirmLogout ?? 'Log out?'),
      message: this.logoutBlocked ? 'Your notes are still saved on this device. Let syncing finish before logging out.' : (t?.confirmLogoutMessage ?? 'Log out on this device?'),
      cancel: t?.cancel ?? 'Cancel', confirm: this.logoutBlocked ? (t?.retry ?? 'Retry') : (t?.logout ?? 'Log out'),
      close: identityCopy(this.translatorService.language).close };
  }

  async confirmLogout() {
    await this.appHaptics.warning();
    this.logoutBlocked = false;
    this.logoutOpen = true;
  }

  async submitLogout() {
    if (this.logoutBusy) return;
    if (this.logoutBlocked) { this.logoutOpen = false; await this.syncWorker.retryPending(); return; }
    this.logoutBusy = true;
    try { await this.logout(); }
    finally { this.logoutBusy = false; }
  }

  private async logout() {
    await this.notesService.flushPersistence();
    // Pending mutations also cover the editor's debounce before enqueueing.
    if (this.notesService.hasPendingMutations() || (await this.outbox.getAll()).length > 0) {
      this.logoutBlocked = true;
      this.logoutOpen = true;
      return;
    }
    await this.authService.revokeCurrentIdentity();
    await this.dataService.clearAppData();
    window.location.replace('/');
  }

  navigateToRegister() {
    this.router.navigate(['/profile/create-account']);
  }

  goToLogin() {
    this.router.navigate(['/profile/login']);
  }
}
