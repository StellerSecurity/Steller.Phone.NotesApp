import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FooterComponent } from './footer.component';
import { BeforeDirective } from './directives/before.directive';
import { IonicModule } from '@ionic/angular';

@NgModule({
  imports: [IonicModule, CommonModule],
  exports: [FooterComponent, BeforeDirective],
  declarations: [BeforeDirective, FooterComponent],
  providers: [],
})
export class FooterModule {}
