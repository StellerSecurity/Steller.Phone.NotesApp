import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';

import { HomePage } from './home.page';
import { HomePageRoutingModule } from './home-routing.module';
import { DeleteNoteModalModule } from '../delete-note-modal/delete-note-modal.module';
import { RestPassModalModule } from '../restpass-modal/resetpass-modal.module';
import { TranslateModule } from '@ngx-translate/core';
import {AppModule} from "../app.module";
import { ClickOutsideDirective } from '../directives/click-outside.directive';
import { DeleteFolderModalModule } from '../delete-folder-modal/delete-folder-modal.module';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        HomePageRoutingModule,
        DeleteNoteModalModule,
        RestPassModalModule,
        DeleteFolderModalModule,
        TranslateModule
    ],
    declarations: [HomePage, ClickOutsideDirective]
})
export class HomePageModule {}
