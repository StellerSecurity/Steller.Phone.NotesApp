import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderBackBtn } from './directives/header-back-btn.directive';
import { HeaderActionbar } from './directives/header-action-bar.directive';
import { HeaderComponent } from './header.component';
import { IonicModule } from '@ionic/angular';

@NgModule({
  imports: [IonicModule, CommonModule],
  exports: [HeaderComponent, HeaderBackBtn, HeaderActionbar],
  declarations: [HeaderBackBtn, HeaderActionbar, HeaderComponent],
  providers: [],
})
export class HeaderModule {}
