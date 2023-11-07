import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddNotePageRoutingModule } from './add-note-routing.module';

import { AddNotePage } from './add-note.page';
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { NoteConfirmModalModule } from '../components/note-confirm-modal/note-confirm-modal.module';
import { ComponentsModule } from '../components/components.module';
import { LayoutModule } from '../layout/layout.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddNotePageRoutingModule,
    PasswordStrengthMeterModule,
    NoteConfirmModalModule,
    ComponentsModule,
    LayoutModule,
  ],
  declarations: [AddNotePage],
})
export class AddNotePageModule {}
