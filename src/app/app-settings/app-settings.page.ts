import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { ActionSheetController, AlertController, IonModal, IonSelect, ModalController, ToastController } from "@ionic/angular";
import { Router } from '@angular/router';
import { NotesService } from "../services/notes.service";
import { CryptoService } from "../services/crypto.service";
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';
import { TranslatorService } from '../services/translator.service';
import { SecureStorageService } from "../services/secure-storage.service";
import { evaluatePasswordStrength, getWeakPasswordEducationKeys, isPasswordAcceptable, shouldConfirmWeakPassword } from '../utils/password-policy';
import { ScreenshotProtectionService } from '../services/screenshot-protection.service';
import { AppHapticsService } from '../services/app-haptics.service';
import { AuthService } from '../services/auth.service';
import { BiometricUnlockService } from '../services/biometric-unlock.service';
import { AppearanceMode, ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-app-settings',
  templateUrl: './app-settings.page.html',
  styleUrls: ['./app-settings.page.scss'],
})
export class AppSettingsPage implements AfterViewInit {
  public appPasswordChallenge: boolean;
  public notesAppPassword: string = '';
  public confirmPassword: string = '';
  public passwordStrengthHelperText = "";
  public passwordStrength = 0;
  public weakPasswordWarningVisible = false;
  public weakPasswordEducationKeys: string[] = [];
  public password_enabled = false;
  public showPassword = false;
  public confirmShowPassword = false;
  public upperLower = false;
  public specialChar = false;
  public strongPass = false;
  public allTranslations: any = {};
  public appLockTimeoutMinutes = 60;
  public readonly appLockTimeoutOptions = [1, 5, 15, 30, 60, 120];
  public screenshotProtectionEnabled = true;
  public hapticsEnabled = true;
  public appWipeAfterDays = 0;
  public readonly appWipeAfterDaysOptions = [0, 7, 14, 28, 30, 60, 90];
  public clipboardAutoClearSeconds = 30;
  public readonly clipboardAutoClearOptions = [0, 30, 60, 120];
  public privacyModeEnabled = false;
  public isSavingPassword = false;
  public selectedLanguage = 'system';
  public languageOptions = this.translatorService.getSupportedLanguageOptions();
  public appearanceMode: AppearanceMode = 'system';
  public appearanceOptions = this.themeService.getAppearanceOptions();
  public isLoggedIn = false;
  public biometricUnlockAvailable = false;
  public biometricUnlockEnabled = false;

  public readonly desktopDownloadUrls = {
    windows: 'https://stellarsecurity.com/download/platform/windows?top=notes',
    linux: 'https://stellarsecurity.com/download/platform/linux?top=notes',
    mac: 'https://stellarsecurity.com/download/platform/mac?top=notes',
  };

  public readonly stellarApps = {
    vpn: {
      downloadTitleKey: 'downloadStellarVpn',
      descriptionKey: 'stellarVpnDescription',
      platforms: [
        {
          labelKey: 'downloadForIos',
          icon: 'logo-apple',
          url: 'https://stellarsecurity.com/download/platform/ios?top=vpn',
        },
        {
          labelKey: 'downloadForAndroid',
          icon: 'logo-android',
          url: 'https://stellarsecurity.com/download/platform/android?top=vpn',
        },
        {
          labelKey: 'downloadForMacos',
          icon: 'logo-apple',
          url: 'https://stellarsecurity.com/download/platform/mac?top=vpn',
        },
        {
          labelKey: 'downloadForWindows',
          icon: 'logo-windows',
          url: 'https://stellarsecurity.com/download/platform/windows?top=vpn',
        },
        {
          labelKey: 'downloadForLinux',
          icon: 'terminal-outline',
          url: 'https://stellarsecurity.com/download/platform/linux?top=vpn',
        },
      ],
    },
    antivirus: {
      downloadTitleKey: 'downloadStellarAntivirus',
      descriptionKey: 'stellarAntivirusDescription',
      platforms: [
        {
          labelKey: 'downloadForAndroid',
          icon: 'logo-android',
          url: 'https://stellarsecurity.com/download/platform/android?top=antivirus',
        },
        {
          labelKey: 'downloadForMacos',
          icon: 'logo-apple',
          url: 'https://stellarsecurity.com/download/platform/mac?top=antivirus',
        },
        {
          labelKey: 'downloadForWindows',
          icon: 'logo-windows',
          url: 'https://stellarsecurity.com/download/platform/windows?top=antivirus',
        },
        {
          labelKey: 'downloadForLinux',
          icon: 'terminal-outline',
          url: 'https://stellarsecurity.com/download/platform/linux?top=antivirus',
        },
      ],
    },
  } as const;

  @ViewChild(IonModal) modal: IonModal;
  @ViewChild('autoLockSelect') autoLockSelect!: IonSelect;
  @ViewChild('wipeSelect') wipeSelect!: IonSelect;
  @ViewChild('clipboardSelect') clipboardSelect!: IonSelect;
  @ViewChild('appearanceSelect') appearanceSelect!: IonSelect;
  @ViewChild('languageSelect') languageSelect!: IonSelect;

  constructor(
    private toastController: ToastController,
    private alertController: AlertController,
    private noteService: NotesService,
    private cryptoService: CryptoService,
    private modalCtrl: ModalController,
    private secureStorageService: SecureStorageService,
    private translatorService: TranslatorService,
    private screenshotProtectionService: ScreenshotProtectionService,
    private appHaptics: AppHapticsService,
    public authService: AuthService,
    private router: Router,
    private biometricUnlockService: BiometricUnlockService,
    private actionSheetController: ActionSheetController,
    private themeService: ThemeService,
  ) {}

  async ionViewWillEnter(): Promise<void> {
    await this.authService.initializeAuthState();
    this.isLoggedIn = this.authService.isLoggedIn;
    this.allTranslations = this.translatorService.allTranslations ?? {};
    this.appLockTimeoutMinutes = this.noteService.getAppLockTimeoutMinutes() || 60;
    this.appWipeAfterDays = this.noteService.getAppWipeAfterDays();
    this.clipboardAutoClearSeconds = this.noteService.getClipboardAutoClearSeconds();
    this.privacyModeEnabled = this.noteService.isPrivacyModeEnabled();
    this.screenshotProtectionEnabled = await this.screenshotProtectionService.isEnabled();
    this.hapticsEnabled = await this.appHaptics.isEnabled();
    this.selectedLanguage = await this.translatorService.getLanguagePreference();
    this.languageOptions = this.translatorService.getSupportedLanguageOptions();
    this.appearanceMode = await this.themeService.getAppearanceMode();
    this.appearanceOptions = this.themeService.getAppearanceOptions();
    await this.refreshBiometricState();
  }

  ionViewDidEnter() {
    this.passwordStrengthHelperText =
      this.allTranslations?.passwordAtLeastLength ?? 'Password must have at least 6 characters';
  }

  ngAfterViewInit() {
    if (this.noteService.appHasPasswordChallenge()) {
      this.password_enabled = true;
    }
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
    this.appLockTimeoutMinutes = this.noteService.getAppLockTimeoutMinutes() || 60;
    this.appWipeAfterDays = this.noteService.getAppWipeAfterDays();
    this.clipboardAutoClearSeconds = this.noteService.getClipboardAutoClearSeconds();
    this.privacyModeEnabled = this.noteService.isPrivacyModeEnabled();
    this.themeService.getAppearanceMode().then((mode) => { this.appearanceMode = mode; });
    this.refreshBiometricState().then(() => {});
  }

  cancel() {
    this.appHaptics.tap();
    this.appPasswordChallenge = this.noteService.appHasPasswordChallenge();
    this.modal.dismiss(null, 'cancel');
  }

  confirm() {
    this.appHaptics.tap();
    this.modal.dismiss("", 'confirm');
  }

  public togglePasswordVisibility() {
    this.appHaptics.selectionChanged();
    this.showPassword = !this.showPassword;
  }

  public toggleConfirmPasswordVisibility() {
    this.appHaptics.selectionChanged();
    this.confirmShowPassword = !this.confirmShowPassword;
  }

  private resetPasswordFormState() {
    this.notesAppPassword = '';
    this.confirmPassword = '';
    this.passwordStrength = 0;
    this.weakPasswordWarningVisible = false;
    this.weakPasswordEducationKeys = [];
    this.upperLower = false;
    this.specialChar = false;
    this.strongPass = false;
    this.passwordStrengthHelperText =
      this.allTranslations?.passwordAtLeastLength ?? 'Password must have at least 6 characters';
  }

  public async save() {
    if (this.isSavingPassword) {
      return;
    }

    if (!isPasswordAcceptable(this.notesAppPassword)) {
      const toast = await this.toastController.create({
        message: this.allTranslations?.thePasswordIsWeakPleaseMakeYourPasswordStronger ?? 'The password is weak. Please make your password stronger.',
        duration: 3000,
        position: 'bottom',
      });
      await this.appHaptics.warning();
      await toast.present();
      return;
    }

    if (shouldConfirmWeakPassword(this.notesAppPassword)) {
      const confirmed = await this.confirmWeakPasswordUsage();
      if (!confirmed) {
        return;
      }
    }

    if (this.notesAppPassword !== this.confirmPassword) {
      const toast = await this.toastController.create({
        message: this.allTranslations?.theTwoPasswordsDoesNotMatch ?? 'The two passwords does not match.',
        duration: 3000,
        position: 'bottom',
      });
      await this.appHaptics.warning();
      await toast.present();
      return;
    }

    this.isSavingPassword = true;

    try {
      const plainNotes = this.noteService.getDecryptedNotes() ?? this.noteService.getNotes() ?? JSON.stringify([]);
      const existingEak = await this.secureStorageService.getItem('ssEakB64');

      if (existingEak != null) {
        const wrappedEak = this.cryptoService.encrypt(existingEak, this.notesAppPassword);
        await this.secureStorageService.setItem('ssEakB64_Encrypted', wrappedEak);
        await this.secureStorageService.removeItem('ssEakB64');
      }

      const plainFolders = this.noteService.getFolders() ?? JSON.stringify([]);
      const encryptedNotes = this.cryptoService.encrypt(plainNotes, this.notesAppPassword);
      const encryptedFolders = this.cryptoService.encrypt(plainFolders, this.notesAppPassword);
      this.noteService.setNotes(encryptedNotes);
      this.noteService.setFolders(encryptedFolders);
      this.noteService.setDecryptedNotes(plainNotes);
      this.noteService.setAppLockTimeoutMinutes(this.appLockTimeoutMinutes || 60);
      this.noteService.setAppWipeAfterDays(this.appWipeAfterDays);
      this.noteService.setClipboardAutoClearSeconds(this.clipboardAutoClearSeconds);
      this.noteService.setPrivacyModeEnabled(this.privacyModeEnabled);
      this.noteService.clearAppUnlockFailures();
      this.noteService.setNotesAppPassword(this.notesAppPassword);
      this.noteService.setAppPasswordChallengeEnabled(true);
      this.noteService.recordSuccessfulAppUnlock();
      await this.noteService.flushPersistence();
      await this.screenshotProtectionService.applyCurrentSetting(true);
      await this.biometricUnlockService.refreshStoredPassword(this.notesAppPassword);
      this.password_enabled = true;
      this.appPasswordChallenge = true;
      this.resetPasswordFormState();
      await this.modal.dismiss();
      await this.appHaptics.success();
    } finally {
      this.isSavingPassword = false;
    }
  }

  public async removePassword() {
    await this.appHaptics.warning();
    const modal = await this.modalCtrl.create({
      component: ConfirmationModalComponent,
      cssClass: 'confirmation-popup'
    });

    modal.onDidDismiss().then(async (data) => {
      if (data && data.data) {
        const { confirm, inputValue } = data.data;
        if (confirm) {
          if (this.noteService.appHasPasswordChallenge() && inputValue) {
            const notes = this.noteService.getNotes();
            const folders = this.noteService.getFolders();
            let decryptedNotes: string | null = null;
            let decryptedFolders: string | null = null;

            try {
              decryptedNotes = this.cryptoService.decrypt(notes, inputValue);
              decryptedFolders = this.cryptoService.decrypt(folders, inputValue);
            } catch (e) {
              const toast = await this.toastController.create({
                message: this.allTranslations?.enteredPasswordIncorrect ?? 'The entered password was not correct.',
                duration: 3000,
                position: 'bottom',
              });
              await this.appHaptics.error();
              await toast.present();
              return;
            }

            const encEak = await this.secureStorageService.getItem('ssEakB64_Encrypted');
            if (encEak != null) {
              const plainEak = this.cryptoService.decrypt(encEak, inputValue);
              await this.secureStorageService.setItem('ssEakB64', plainEak);
              await this.secureStorageService.removeItem('ssEakB64_Encrypted');
            }

            this.noteService.setNotes(decryptedNotes);
            this.noteService.setFolders(decryptedFolders ?? JSON.stringify([]));
            this.noteService.setDecryptedNotes(decryptedNotes);
            this.appWipeAfterDays = 0;
            this.noteService.clearAppUnlockFailures();
            this.noteService.setNotesAppPassword('');
            this.noteService.setAppPasswordChallengeEnabled(false);
            await this.biometricUnlockService.setEnabled(false);
            this.biometricUnlockEnabled = false;
            await this.noteService.flushPersistence();
            await this.screenshotProtectionService.applyCurrentSetting(false);
            this.password_enabled = false;
            this.appPasswordChallenge = false;
            this.resetPasswordFormState();
            await this.modal.dismiss();
            await this.appHaptics.success();
          } else {
            const toast = await this.toastController.create({
              message: this.allTranslations?.enterYourCurrentPassword ?? 'Enter your current password',
              duration: 3000,
              position: 'bottom',
            });
            await this.appHaptics.warning();
            await toast.present();
          }
        }
      }
    });

    return await modal.present();
  }

  private async confirmWeakPasswordUsage(): Promise<boolean> {
    const alert = await this.alertController.create({
      header: this.allTranslations?.warning ?? 'Warning',
      message: this.allTranslations?.weakPasswordConfirmMessage ?? 'This password is weak and may be easier to guess. Do you want to continue anyway?',
      buttons: [
        {
          text: this.allTranslations?.cancel ?? 'Cancel',
          role: 'cancel',
          handler: () => {
            this.appHaptics.tap();
          },
        },
        {
          text: this.allTranslations?.useAnyway ?? 'Use anyway',
          role: 'confirm',
          handler: () => {
            this.appHaptics.warning();
          },
        },
      ],
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }

  public notesAppPasswordChange() {
    const strength = evaluatePasswordStrength(this.notesAppPassword);
    this.passwordStrength = strength.score;
    this.upperLower = strength.upperLower;
    this.specialChar = strength.specialChar;
    this.strongPass = strength.strongPass;
    this.weakPasswordWarningVisible = shouldConfirmWeakPassword(this.notesAppPassword);
    this.weakPasswordEducationKeys = this.weakPasswordWarningVisible
      ? getWeakPasswordEducationKeys(this.notesAppPassword)
      : [];
    this.passwordStrengthHelperText =
      this.allTranslations?.[strength.helperKey] ?? '';
  }

  public async saveAppLockTimeout() {
    this.appHaptics.selectionChanged();
    this.noteService.setAppLockTimeoutMinutes(this.appLockTimeoutMinutes || 60);
    await this.noteService.flushPersistence();
  }

  public async screenshotProtectionChange() {
    await this.appHaptics.selectionChanged();
    await this.screenshotProtectionService.setEnabled(this.screenshotProtectionEnabled);
    await this.screenshotProtectionService.applyCurrentSetting(this.password_enabled);
  }

  public async hapticsChange() {
    const nextValue = this.hapticsEnabled;
    await this.appHaptics.setEnabled(nextValue);

    if (nextValue) {
      await this.appHaptics.selectionChanged();
    }
  }

  public async toggleHapticsFromRow() {
    this.hapticsEnabled = !this.hapticsEnabled;
    await this.hapticsChange();
  }

  public getAppLockTimeoutLabel(minutes: number): string {
    const t = this.allTranslations ?? {};
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
    if (safeMinutes === 1) {
      return t.autoLockAfterOneMinute ?? 'After 1 minute';
    }
    const after = t.autoLockAfter ?? 'After';
    const minutesLabel = t.minutes ?? 'minutes';
    return `${after} ${safeMinutes} ${minutesLabel}`;
  }

  public async saveAppWipeAfterDays() {
    const previous = this.noteService.getAppWipeAfterDays();

    if (this.appWipeAfterDays > 0 && previous === 0) {
      const alert = await this.alertController.create({
        header: this.allTranslations?.enableInactiveDeviceWipeTitle ?? 'Enable inactive device wipe?',
        message: this.allTranslations?.enableInactiveDeviceWipeMessage ?? 'If the app is not unlocked for the selected number of days, all local notes and app data on this device will be erased.',
        buttons: [
          {
            text: this.allTranslations?.cancel ?? 'Cancel',
            role: 'cancel',
            handler: () => {
              this.appHaptics.tap();
              this.appWipeAfterDays = previous;
            },
          },
          {
            text: this.allTranslations?.enableWipe ?? 'Enable wipe',
            role: 'confirm',
            handler: async () => {
              await this.appHaptics.warning();
              this.noteService.setAppWipeAfterDays(this.appWipeAfterDays);
              if (this.noteService.getLastSuccessfulAppUnlockAt() === 0) {
                this.noteService.recordSuccessfulAppUnlock();
              }
              await this.noteService.flushPersistence();
            },
          },
        ],
      });

      await alert.present();
      return;
    }

    this.noteService.setAppWipeAfterDays(this.appWipeAfterDays);
    await this.appHaptics.selectionChanged();

    if (this.appWipeAfterDays > 0 && this.noteService.getLastSuccessfulAppUnlockAt() === 0) {
      this.noteService.recordSuccessfulAppUnlock();
    }

    await this.noteService.flushPersistence();
  }

  public getAppWipeAfterDaysLabel(days: number): string {
    const t = this.allTranslations ?? {};
    const safeDays = Number.isFinite(days) && days >= 0 ? days : 0;
    if (safeDays === 0) {
      return t.off ?? 'Off';
    }
    if (safeDays === 1) {
      return t.afterOneDay ?? 'After 1 day';
    }
    const after = t.after ?? 'After';
    const daysLabel = t.days ?? 'days';
    return `${after} ${safeDays} ${daysLabel}`;
  }

  public getClipboardAutoClearLabel(seconds: number): string {
    const t = this.allTranslations ?? {};
    if (seconds === 0) {
      return t.off ?? 'Off';
    }
    if (seconds === 30) {
      return t.clipboardAutoClear30Seconds ?? 'After 30 seconds';
    }
    if (seconds === 60) {
      return t.clipboardAutoClear60Seconds ?? 'After 60 seconds';
    }
    if (seconds === 120) {
      return t.clipboardAutoClear2Minutes ?? 'After 2 minutes';
    }
    return t.off ?? 'Off';
  }

  public async saveClipboardAutoClear() {
    this.appHaptics.selectionChanged();
    this.noteService.setClipboardAutoClearSeconds(this.clipboardAutoClearSeconds);
    await this.noteService.flushPersistence();
  }

  public async privacyModeChange() {
    await this.appHaptics.selectionChanged();
    this.noteService.setPrivacyModeEnabled(this.privacyModeEnabled);
    await this.noteService.flushPersistence();
  }

  public async togglePrivacyModeFromRow() {
    this.privacyModeEnabled = !this.privacyModeEnabled;
    await this.privacyModeChange();
  }

  public async saveLanguage() {
    await this.appHaptics.selectionChanged();
    await this.translatorService.setLanguage(this.selectedLanguage);
    this.allTranslations = this.translatorService.allTranslations ?? {};
    this.languageOptions = this.translatorService.getSupportedLanguageOptions();
  }

  public async saveAppearance() {
    await this.appHaptics.selectionChanged();
    await this.themeService.setAppearanceMode(this.appearanceMode);
  }

  public getAppearanceLabel(option: { value: AppearanceMode; labelKey: string }): string {
    return this.allTranslations?.[option.labelKey] ?? option.value;
  }

  public getLanguageLabel(option: { value: string; label?: string; labelKey?: string }): string {
    if (option.label) {
      return option.label;
    }
    return this.allTranslations?.[option.labelKey ?? 'usePhoneLanguage'] ?? 'Use phone language';
  }

  public async appPasswordChallengeDialog() {
    await this.appHaptics.tap();
    await this.modal.present();
  }

  public openAutoLockSelect() {
    this.appHaptics.tap();
    this.autoLockSelect?.open();
  }

  public openWipeSelect() {
    this.appHaptics.tap();
    this.wipeSelect?.open();
  }

  public openClipboardSelect() {
    this.appHaptics.tap();
    this.clipboardSelect?.open();
  }

  public openAppearanceSelect() {
    this.appHaptics.tap();
    this.appearanceSelect?.open();
  }

  public openLanguageSelect() {
    this.appHaptics.tap();
    this.languageSelect?.open();
  }

  public async toggleScreenshotProtectionFromRow() {
    this.screenshotProtectionEnabled = !this.screenshotProtectionEnabled;
    await this.screenshotProtectionChange();
  }


  private async refreshBiometricState(): Promise<void> {
    const availability = await this.biometricUnlockService.isAvailable();
    this.biometricUnlockAvailable = availability.available;
    this.biometricUnlockEnabled = await this.biometricUnlockService.isEnabled();

    if (!this.biometricUnlockAvailable && this.biometricUnlockEnabled) {
      await this.biometricUnlockService.setEnabled(false);
      this.biometricUnlockEnabled = false;
    }
  }


  private getBiometricPromptLabels() {
    return {
      reason: this.allTranslations?.biometricPromptReason ?? 'Unlock Stellar Private Notes',
      title: this.allTranslations?.biometricPromptTitle ?? 'Unlock Notes',
      subtitle: this.allTranslations?.biometricPromptSubtitle ?? 'Use your device biometrics to unlock your private notes.',
      description: this.allTranslations?.biometricPromptDescription ?? 'Your notes remain encrypted on this device.',
      negativeButtonText: this.allTranslations?.usePassword ?? 'Use Password',
    };
  }

  public async biometricUnlockChange() {
    await this.appHaptics.selectionChanged();

    if (!this.password_enabled) {
      this.biometricUnlockEnabled = false;
      return;
    }

    if (this.biometricUnlockEnabled) {
      const password = this.noteService.getNotesAppPassword();

      if (!password) {
        this.biometricUnlockEnabled = false;
        const toast = await this.toastController.create({
          message: this.allTranslations?.unlockAppBeforeEnablingBiometrics ?? 'Unlock the app with your password before enabling biometrics.',
          duration: 3000,
          position: 'bottom',
        });
        await this.appHaptics.warning();
        await toast.present();
        return;
      }

      const enabled = await this.biometricUnlockService.enableWithPassword(password, this.getBiometricPromptLabels());
      this.biometricUnlockEnabled = enabled;

      const toast = await this.toastController.create({
        message: enabled
          ? (this.allTranslations?.biometricUnlockEnabledMessage ?? 'Biometric unlock is enabled.')
          : (this.allTranslations?.biometricUnlockUnavailableMessage ?? 'Biometric unlock is not available on this device.'),
        duration: 3000,
        position: 'bottom',
      });
      await (enabled ? this.appHaptics.success() : this.appHaptics.warning());
      await toast.present();
      return;
    }

    await this.biometricUnlockService.setEnabled(false);
    this.biometricUnlockEnabled = false;
  }

  public async toggleBiometricUnlockFromRow() {
    if (!this.biometricUnlockAvailable) {
      const toast = await this.toastController.create({
        message: this.allTranslations?.biometricUnlockUnavailableMessage ?? 'Biometric unlock is not available on this device.',
        duration: 3000,
        position: 'bottom',
      });
      await this.appHaptics.warning();
      await toast.present();
      return;
    }

    this.biometricUnlockEnabled = !this.biometricUnlockEnabled;
    await this.biometricUnlockChange();
  }

  public async openDesktopDownloads() {
    await this.appHaptics.tap();

    const actionSheet = await this.actionSheetController.create({
      header: this.allTranslations?.getNotesForDesktop ?? 'Get Notes for desktop',
      subHeader: this.allTranslations?.desktopAppsDescription ?? 'Available for Windows, macOS and Linux.',
      buttons: [
        {
          text: this.allTranslations?.downloadForWindows ?? 'Download for Windows',
          icon: 'logo-windows',
          handler: () => this.openExternalUrl(this.desktopDownloadUrls.windows),
        },
        {
          text: this.allTranslations?.downloadForMacos ?? 'Download for macOS',
          icon: 'logo-apple',
          handler: () => this.openExternalUrl(this.desktopDownloadUrls.mac),
        },
        {
          text: this.allTranslations?.downloadForLinux ?? 'Download for Linux',
          icon: 'terminal-outline',
          handler: () => this.openExternalUrl(this.desktopDownloadUrls.linux),
        },
        {
          text: this.allTranslations?.cancel ?? 'Cancel',
          role: 'cancel',
        },
      ],
    });

    await actionSheet.present();
  }

  public async openStellarAppDownloads(product: 'vpn' | 'antivirus') {
    await this.appHaptics.tap();

    const app = this.stellarApps[product];
    const actionSheet = await this.actionSheetController.create({
      header: this.allTranslations?.[app.downloadTitleKey] ?? app.downloadTitleKey,
      subHeader: this.allTranslations?.[app.descriptionKey] ?? app.descriptionKey,
      buttons: [
        ...app.platforms.map((platform) => ({
          text: this.allTranslations?.[platform.labelKey] ?? platform.labelKey,
          icon: platform.icon,
          handler: () => this.openExternalUrl(platform.url),
        })),
        {
          text: this.allTranslations?.cancel ?? 'Cancel',
          role: 'cancel',
        },
      ],
    });

    await actionSheet.present();
  }

  private openExternalUrl(url: string) {
    this.appHaptics.tap();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  public goToDeleteAccount() {
    this.appHaptics.tap();
    this.router.navigate(['/profile/delete-account']);
  }
}
