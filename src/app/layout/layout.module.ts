import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HeaderModule } from './header/header.module';

@NgModule({
  declarations: [],
  imports: [CommonModule, IonicModule, HeaderModule],
  exports: [HeaderModule],
})
export class LayoutModule {}
