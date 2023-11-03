import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';

import { ButtonComponent } from './button/button.component';
import { LinkComponent } from './link/link.component';

@NgModule({
  declarations: [ButtonComponent, LinkComponent],
  imports: [CommonModule, IonicModule, RouterModule],
  exports: [ButtonComponent, LinkComponent],
})
export class ComponentsModule {}
