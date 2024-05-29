import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { NoteLockedModalComponent } from './note-locked-modal.component';

@NgModule({
  declarations: [NoteLockedModalComponent],
  imports: [
    CommonModule,
    IonicModule
  ],
  exports: [NoteLockedModalComponent],
})
export class NoteLockedModalModule { }