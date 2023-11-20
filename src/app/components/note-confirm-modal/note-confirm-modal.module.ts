import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IonicModule } from '@ionic/angular';
import { NoteConfirmModalActionDirective } from './directives/note-confirm-modal-action-directive';
import { NoteConfirmModalIconDirective } from './directives/note-confirm-modal-icon-directive';
import { NoteConfirmModalComponent } from './note-confirm-modal.component';

@NgModule({
  imports: [IonicModule, CommonModule],
  exports: [
    NoteConfirmModalActionDirective,
    NoteConfirmModalIconDirective,
    NoteConfirmModalComponent,
  ],
  declarations: [
    NoteConfirmModalActionDirective,
    NoteConfirmModalIconDirective,
    NoteConfirmModalComponent,],
  providers: [
  ],
})
export class NoteConfirmModalModule {}
