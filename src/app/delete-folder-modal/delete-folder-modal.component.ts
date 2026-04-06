import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AppHapticsService } from '../services/app-haptics.service';

@Component({
  selector: 'app-delete-folder-modal',
  templateUrl: './delete-folder-modal.component.html',
  styleUrls: ['./delete-folder-modal.component.scss'],
})
export class DeleteFolderModalComponent {
  @Input() folderName = '';
  @Input() noteCount = 0;

  constructor(
    private modalCtrl: ModalController,
    private appHaptics: AppHapticsService,
  ) {}

  public dismiss(confirm: boolean): void {
    if (confirm) {
      this.appHaptics.warning();
    } else {
      this.appHaptics.tap();
    }

    this.modalCtrl.dismiss({ confirm });
  }
}
