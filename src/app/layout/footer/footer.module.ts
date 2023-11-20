import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FooterComponent } from './footer.component';
import { BeforeDirective } from './directives/footer-before.directive';
import { IonicModule } from '@ionic/angular';
import { BodyDirective } from './directives/footer-body.directive';

@NgModule({
  imports: [IonicModule, CommonModule],
  exports: [FooterComponent, BeforeDirective, BodyDirective],
  declarations: [BeforeDirective, FooterComponent, BodyDirective],
  providers: [],
})
export class FooterModule {}
