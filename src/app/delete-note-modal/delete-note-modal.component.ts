import { Component, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-delete-note-modal',
  templateUrl: './delete-note-modal.component.html',
  styleUrls: ['./delete-note-modal.component.scss'],
})
export class DeleteNoteModalComponent {

  constructor(private modalCtrl: ModalController) { }

  // Dismiss the modal with the confirmation result
  public dismiss(confirm: boolean): void {
    this.modalCtrl.dismiss({ confirm });
  }
  
}