import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SettingsNotePageRoutingModule } from './settings-note-routing.module';

import { SettingsNotePage } from './settings-note.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SettingsNotePageRoutingModule
  ],
  declarations: [SettingsNotePage]
})
export class SettingsNotePageModule {}
