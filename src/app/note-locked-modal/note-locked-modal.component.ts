import { Component, ViewChild } from '@angular/core';
import { IonInput, ModalController } from '@ionic/angular';
import { AppHapticsService } from '../services/app-haptics.service';

@Component({
  selector: 'app-note-locked-modal',
  templateUrl: './note-locked-modal.component.html',
  styleUrls: ['./note-locked-modal.component.scss'],
})
export class NoteLockedModalComponent {
  public showPassword: boolean = false;
  @ViewChild('passwordInput', { static: false }) passwordInput!: IonInput;

  constructor(private modalCtrl: ModalController, private appHaptics: AppHapticsService) { }

  ngAfterViewInit() {
    // Wait a tick to ensure modal animation finishes before focusing
    setTimeout(() => {
      this.passwordInput?.setFocus();
    }, 200);
  }

  // Dismiss the modal with the confirmation result
  public dismiss(confirm: boolean): void {
    // Get the input value before dismissing the modal
    const inputValue = this.passwordInput.value;
    if (confirm) {
      this.appHaptics.tap();
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

  onEnter() {
    this.dismiss(true);
  }
}