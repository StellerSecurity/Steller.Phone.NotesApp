import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SettingCardComponent } from './setting-card.component';
import { LeftSideDirective } from './directives/setting-card-left-side.directive';
import { RightSideDirective } from './directives/setting-card-right-side.directive';
import { TitleDirective } from './directives/setting-card-title.directive';
import { IonicModule } from '@ionic/angular';

@NgModule({
  imports: [IonicModule, CommonModule],
  exports: [SettingCardComponent, LeftSideDirective, RightSideDirective, TitleDirective],
  declarations: [SettingCardComponent, LeftSideDirective, RightSideDirective, TitleDirective],
  providers: [],
})
export class SettingCardModule {}
