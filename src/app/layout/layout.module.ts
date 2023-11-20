import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HeaderModule } from './header/header.module';
import { FooterModule } from './footer/footer.module';

@NgModule({
  declarations: [],
  imports: [CommonModule, IonicModule, HeaderModule],
  exports: [FooterModule, HeaderModule],
})
export class LayoutModule {}
