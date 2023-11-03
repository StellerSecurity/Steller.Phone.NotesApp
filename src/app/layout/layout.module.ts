import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FooterComponent } from './footer/footer.component';
import { HeaderModule } from './header/header.module';

@NgModule({
  declarations: [FooterComponent],
  imports: [CommonModule, IonicModule, HeaderModule],
  exports: [FooterComponent, HeaderModule],
})
export class LayoutModule {}
