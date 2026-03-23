import { Component, Input, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AppHapticsService } from '../services/app-haptics.service';

@Component({
  selector: 'app-delete-note-modal',
  templateUrl: './delete-note-modal.component.html',
  styleUrls: ['./delete-note-modal.component.scss'],
})
export class DeleteNoteModalComponent {
  @Input() isSingleDelete: boolean = false; 

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