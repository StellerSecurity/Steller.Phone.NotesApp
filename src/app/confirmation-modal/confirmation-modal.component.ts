import { Component, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AppHapticsService } from '../services/app-haptics.service';

@Component({
  selector: 'app-confirmation-modal',
  templateUrl: './confirmation-modal.component.html',
  styleUrls: ['./confirmation-modal.component.scss'],
})
export class ConfirmationModalComponent {
  public showPassword: boolean = false;
  @ViewChild('passwordInput', { static: false }) passwordInput: { value: any; };

  constructor(private modalCtrl: ModalController, private appHaptics: AppHapticsService) { }

  // Dismiss the modal with the confirmation result
  public dismiss(confirm: boolean): void {
    // Get the input value before dismissing the modal
    const inputValue = this.passwordInput.value;
    if (confirm) {
      this.appHaptics.warning();
    } else {
      this.appHaptics.tap();
    }
    this.modalCtrl.dismiss({ confirm, inputValue });
  }

  // Toggle password visibility
  public togglePasswordVisibility(): void {
    this.appHaptics.selectionChanged();
    this.showPassword = !this.showPassword;
  }
}