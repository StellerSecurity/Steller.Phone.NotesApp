import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { DeleteFolderModalComponent } from './delete-folder-modal.component';

@NgModule({
  declarations: [DeleteFolderModalComponent],
  imports: [
    CommonModule,
    IonicModule,
    TranslateModule,
  ],
  exports: [DeleteFolderModalComponent],
})
export class DeleteFolderModalModule {}
