import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ResetPassModalComponent } from './resetpass-modal.component';

@NgModule({
  declarations: [ResetPassModalComponent],
  imports: [
    CommonModule,
    IonicModule
  ],
  exports: [ResetPassModalComponent],
})
export class RestPassModalModule { }