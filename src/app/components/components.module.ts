import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ButtonComponent } from './button/button.component';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [ButtonComponent],
  imports: [CommonModule, IonicModule, RouterModule],
  exports: [ButtonComponent],
})
export class ComponentsModule {}
