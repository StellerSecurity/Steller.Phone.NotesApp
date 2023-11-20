import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { IonicModule } from '@ionic/angular';
import { PasswordInputComponent } from './password-input.component';
import { PasswordStrengthModule } from '../password-strength/password-strength.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    PasswordStrengthMeterModule,
    IonicModule,
    PasswordStrengthModule
  ],
  exports: [PasswordInputComponent],
  declarations: [PasswordInputComponent],
  providers: [],
})
export class PasswordInputModule {}
