import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { ButtonComponent } from './button/button.component';
import { LinkComponent } from './link/link.component';
import { NoteListComponent } from './note-list/note-list.component';
import { PipesModule } from '../pipes/pipes.module';
import { SettingCardModule } from './setting-card/setting-card.module';
import { PasswordInputModule } from './password-input/password-input.module';
import { NoteConfirmModalModule } from './note-confirm-modal/note-confirm-modal.module';
@NgModule({
  declarations: [
    ButtonComponent,
    LinkComponent,
    NoteListComponent,
  ],
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    PipesModule,
    SettingCardModule,
    PasswordInputModule,
    NoteConfirmModalModule,
  ],
  exports: [
    ButtonComponent,
    LinkComponent,
    NoteListComponent,
    CommonModule,
    IonicModule,
    RouterModule,
    PipesModule,
    SettingCardModule,
    PasswordInputModule,
    NoteConfirmModalModule,
  ],
})
export class ComponentsModule {}
