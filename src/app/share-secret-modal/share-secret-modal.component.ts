import { Component, Input } from '@angular/core';
import {LoadingController, ModalController, ToastController} from '@ionic/angular';
import { SecretapiService } from '../services/secretapi.service';
import { Share } from '@capacitor/share';
import { Router } from '@angular/router';
import { TranslatorService } from '../services/translator.service';

@Component({
  selector: 'app-share-secret-modal',
  templateUrl: './share-secret-modal.component.html',
  styleUrls: ['./share-secret-modal.component.scss']
})
export class ShareSecretModalComponent {
  secretUrl: string = '';
  @Input() addSecretModal:any;
  @Input() secret_id:any;
  expiryText: string = '';
  step = 1;
  isLoading= false;
  createdSecret:any;
  allTranslations:any;
  isDeletingSecret=false;

  constructor(private modalCtrl: ModalController,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private secretapi: SecretapiService,
    private router: Router,
    private translatorService: TranslatorService,) {}

    ionViewWillEnter() {
      this.step = 1;
      this.allTranslations = this.translatorService.allTranslations;
    }

  closeModal() {
    this.modalCtrl.dismiss();
  }

  async createSecret() {

    const loading = await this.loadingController.create();
    await loading.present();

    this.secretapi.create(this.addSecretModal).subscribe({
    next: async (response) => {
      this.createdSecret = response;
      this.step = 2;
      this.secretUrl = `https://stellarsecret.io/${this.secret_id}`
      //this.expiryText= `7 days (${this.formatDate(response?.expires_at)})`;
      this.expiryText = ''; // not in use atm.
    },
    error: async (error) => {
      await loading.dismiss();
      this.isLoading = false;
      alert(this.allTranslations?.failedToShareSecret ?? "Failed to share secret. Please check your internet connection or try again.");
    },
    complete: async () => {
      // Optional cleanup logic
      await loading.dismiss();
      this.isLoading = false;
    }
    });
  }

  burnSecret() {
    this.isDeletingSecret = true;
    this.secretapi.delete(this.createdSecret?.id).subscribe({
      next: async (response) => {
        this.closeModal();
        const toast = await this.toastController.create({
          message: this.allTranslations.secretDeletedSuccessfully,
          duration: 2500,
          position: 'bottom',
        });

        await toast.present();
      },
      error: async (error) => {

      },
      complete: async () => {
        this.isDeletingSecret = false;
        // Optional cleanup logic
        // await loading.dismiss();
      }
    });
  }

  copyLink() {
    navigator.clipboard.writeText(this.secretUrl).then(async ()=> {
      const toast = await this.toastController.create({
        message: this.allTranslations?.linkCopied ?? "Link copied.",
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();
    });
  }

  async shareLink() {
    await Share.share({
      title: this.allTranslations?.shareSecretTitle ?? 'Stellar Secret',
      text: this.allTranslations?.hereIsYourSecretLink ?? 'Here is your secret link',
      url: this.secretUrl,
      dialogTitle: this.allTranslations?.shareDialogTitle ?? 'Stellar Note',
    });
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);

    const hours = String(date.getHours()).padStart(2, '0');     // 14
    const minutes = String(date.getMinutes()).padStart(2, '0'); // 33
    const day = String(date.getDate()).padStart(2, '0');        // 14
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 02 (zero-indexed)
    const year = date.getFullYear();                            // 2023

    return `${hours}:${minutes}, ${day}.${month}.${year}`;
  }
}
