import { Component, Input } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { SecretapiService } from '../services/secretapi.service';
import { Share } from '@capacitor/share';

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

  constructor(private modalCtrl: ModalController,
    private toastController: ToastController,
    private secretapi: SecretapiService,) {}

    ionViewWillEnter() {
      this.step = 1;
    }

  closeModal() {
    this.modalCtrl.dismiss();
  }

  creteSecret() {
     this.secretapi.create(this.addSecretModal).subscribe({
      next: async (response) => {
      this.step = 2;
      this.secretUrl = `https://stellarsecret.io/${this.secret_id}`
      this.expiryText= `7 days (${this.formatDate(response?.expires_at)})`;
      },
      error: async (error) => {
        alert("Failed to share secret.");
      },
      complete: async () => {
        // Optional cleanup logic
        this.isLoading = false;
      }
    });
  }

  copyLink() {
    navigator.clipboard.writeText(this.secretUrl).then(async ()=> {
      const toast = await this.toastController.create({
        message: "Link copied.",
        duration: 3000,
        position: 'bottom',
      });

      await toast.present();
    });
  }

  async shareLink() {
    // if (navigator.share) {
    //   navigator.share({
    //     title: 'Stellar Secret',
    //     text: 'Here is your secret link',
    //     url: this.secretUrl,
    //   });
    // }

    await Share.share({
      title: 'Stellar Secret',
      text: 'Here is your secret link',
      url: this.secretUrl,
      dialogTitle: 'Stellar Private Note',
    });
  }

  burnSecret() {
    // TODO: Implement actual burn logic (emit or call service)
    alert('Burn Secret clicked!');
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
