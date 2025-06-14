import { Component, Input } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-share-secret-modal',
  templateUrl: './share-secret-modal.component.html',
  styleUrls: ['./share-secret-modal.component.scss']
})
export class ShareSecretModalComponent {
  @Input() secretUrl: string = '';
  @Input() expiryText: string = '';

  constructor(private modalCtrl: ModalController,
    private toastController: ToastController,) {}

  closeModal() {
    this.modalCtrl.dismiss();
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

  shareLink() {
    if (navigator.share) {
      navigator.share({
        title: 'Stellar Secret',
        text: 'Here is your secret link',
        url: this.secretUrl,
      });
    }
  }

  burnSecret() {
    // TODO: Implement actual burn logic (emit or call service)
    alert('Burn Secret clicked!');
  }
}
