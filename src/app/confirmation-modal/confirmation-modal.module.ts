import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ConfirmationModalComponent } from './confirmation-modal.component';

@NgModule({
  declarations: [ConfirmationModalComponent],
  imports: [
    CommonModule,
    IonicModule
  ],
  exports: [ConfirmationModalComponent],
})
export class ConfirmationModalModule { }