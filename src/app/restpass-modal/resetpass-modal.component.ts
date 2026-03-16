import { Component, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AppHapticsService } from '../services/app-haptics.service';

@Component({
  selector: 'app-resetpass-modal',
  templateUrl: './resetpass-modal.component.html',
  styleUrls: ['./resetpass-modal.component.scss'],
})
export class ResetPassModalComponent {
  constructor(private modalCtrl: ModalController, private appHaptics: AppHapticsService) { }

  // Dismiss the modal with the confirmation result
  public dismiss(confirm: boolean): void {
    if (confirm) {
      this.appHaptics.warning();
    } else {
      this.appHaptics.tap();
    }
    this.modalCtrl.dismiss({ confirm });
  }
}