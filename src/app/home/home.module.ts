import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

import { HomePage } from './home.page';
import { HomePageRoutingModule } from './home-routing.module';
import { DeleteNoteModalModule } from '../delete-note-modal/delete-note-modal.module';
import { RestPassModalModule } from '../restpass-modal/resetpass-modal.module';
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomePageRoutingModule,
    DeleteNoteModalModule,
    RestPassModalModule
  ],
  declarations: [HomePage]
})
export class HomePageModule {}
