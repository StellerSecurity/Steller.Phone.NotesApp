import { Component, Input } from '@angular/core';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { SecretapiService } from '../services/secretapi.service';
import { Share } from '@capacitor/share';
import { Router } from '@angular/router';
import { TranslatorService } from '../services/translator.service';
import { AppHapticsService } from '../services/app-haptics.service';
import { NotesService } from '../services/notes.service';
import { AppsflyerService } from '../services/appsflyer.service';
@Component({
  selector: 'app-share-secret-modal',
  templateUrl: './share-secret-modal.component.html',
  styleUrls: ['./share-secret-modal.component.scss']
})
export class ShareSecretModalComponent {
  secretUrl: string = '';
  @Input() addSecretModal: any;
  @Input() secret_id: any;
  expiryText: string = '';
  step = 1;
  isLoading = false;
  createdSecret: any;
  allTranslations: any;
  isDeletingSecret = false;
  private clipboardClearTimer: any = null;
  constructor(
    private modalCtrl: ModalController,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private secretapi: SecretapiService,
    private router: Router,
    private translatorService: TranslatorService,
    private appHaptics: AppHapticsService,
    private notesService: NotesService,
    private appsflyer: AppsflyerService,
  ) {}
  ionViewWillEnter() {
    this.step = 1;
    this.allTranslations = this.translatorService.allTranslations;
  }
  ionViewWillLeave() {
    this.clearClipboardTimer();
  }
  private clearClipboardTimer() {
    if (this.clipboardClearTimer) {
      clearTimeout(this.clipboardClearTimer);
      this.clipboardClearTimer = null;
    }
  }
  private async scheduleClipboardClear(expectedValue: string) {
    const delaySeconds = this.notesService.getClipboardAutoClearSeconds();
    if (!delaySeconds || delaySeconds <= 0) {
      return;
    }
    this.clearClipboardTimer();
    this.clipboardClearTimer = setTimeout(async () => {
      try {
        const currentClipboard = await navigator.clipboard.readText();
        if (currentClipboard !== expectedValue) {
          return;
        }
        await navigator.clipboard.writeText('');
      } catch (error) {
        // Ignore clipboard read/write failures silently.
      }
    }, delaySeconds * 1000);
  }
  closeModal() {
    this.appHaptics.tap();
    this.clearClipboardTimer();
    this.modalCtrl.dismiss();
  }
  async createSecret() {
    await this.appHaptics.tap();
    const loading = await this.loadingController.create();
    await loading.present();
    this.secretapi.create(this.addSecretModal).subscribe({
      next: async (response) => {
        this.createdSecret = response;
        this.step = 2;
        this.secretUrl = `https://stellarsecret.io/${this.secret_id}`;
        this.expiryText = '';
        void this.appsflyer.logEvent('stellar_secret_created', { source: 'note_share' });
        await this.appHaptics.success();
      },
      error: async () => {
        await loading.dismiss();
        this.isLoading = false;
        await this.appHaptics.error();
        alert(this.allTranslations?.failedToShareSecret ?? "Failed to share secret. Please check your internet connection or try again.");
      },
      complete: async () => {
        await loading.dismiss();
        this.isLoading = false;
      }
    });
  }
  burnSecret() {
    this.appHaptics.warning();
    this.isDeletingSecret = true;
    this.secretapi.delete(this.createdSecret?.id).subscribe({
      next: async () => {
        this.closeModal();
        const toast = await this.toastController.create({
          message: this.allTranslations.secretDeletedSuccessfully,
          duration: 2500,
          position: 'bottom',
        });
        void this.appsflyer.logEvent('stellar_secret_burned');
        await this.appHaptics.success();
        await toast.present();
      },
      error: async () => {
      },
      complete: async () => {
        this.isDeletingSecret = false;
      }
    });
  }
  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.secretUrl);
      await this.scheduleClipboardClear(this.secretUrl);
      void this.appsflyer.logEvent('stellar_secret_link_copied', {
        clipboard_auto_clear_enabled: this.appsflyer.booleanLabel(this.notesService.getClipboardAutoClearSeconds() > 0),
      });
      const delaySeconds = this.notesService.getClipboardAutoClearSeconds();
      const message =
        delaySeconds > 0
          ? (this.allTranslations?.clipboardAutoClearMessage ?? "Link copied. Clipboard will clear automatically.")
          : (this.allTranslations?.linkCopied ?? "Link copied.");
      const toast = await this.toastController.create({
        message,
        duration: 3000,
        position: 'bottom',
      });
      await this.appHaptics.success();
      await toast.present();
    } catch (error) {
      const toast = await this.toastController.create({
        message: this.allTranslations?.operationFailed ?? "Operation Failed!",
        duration: 3000,
        position: 'bottom',
      });
      await this.appHaptics.error();
      await toast.present();
    }
  }
  async shareLink() {
    await this.appHaptics.tap();
    void this.appsflyer.logEvent('stellar_secret_link_shared', { method: 'system_share' });
    await Share.share({
      title: this.allTranslations?.shareSecretTitle ?? 'Stellar Secret',
      text: this.allTranslations?.hereIsYourSecretLink ?? 'Here is your secret link',
      url: this.secretUrl,
      dialogTitle: this.allTranslations?.shareDialogTitle ?? 'Stellar Note',
    });
  }
  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${hours}:${minutes}, ${day}.${month}.${year}`;
  }
}
