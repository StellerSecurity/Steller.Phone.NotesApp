import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { DeleteNoteModalComponent } from './delete-note-modal.component';

@NgModule({
  declarations: [DeleteNoteModalComponent],
  imports: [
    CommonModule,
    IonicModule
  ],
  exports: [DeleteNoteModalComponent],
})
export class DeleteNoteModalModule { }