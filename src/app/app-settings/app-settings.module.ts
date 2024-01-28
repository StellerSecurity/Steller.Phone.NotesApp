import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AppSettingsPageRoutingModule } from './app-settings-routing.module';

import { AppSettingsPage } from './app-settings.page';
import {PasswordStrengthMeterModule} from "angular-password-strength-meter";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        AppSettingsPageRoutingModule,
        PasswordStrengthMeterModule
    ],
  declarations: [AppSettingsPage]
})
export class AppSettingsPageModule {}
