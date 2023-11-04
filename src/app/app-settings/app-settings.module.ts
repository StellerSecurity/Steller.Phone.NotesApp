import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AppSettingsPageRoutingModule } from './app-settings-routing.module';

import { AppSettingsPage } from './app-settings.page';
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { ComponentsModule } from '../components/components.module';
import { LayoutModule } from '../layout/layout.module';
import { SettingCardModule } from '../components/setting-card/setting-card.module';
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AppSettingsPageRoutingModule,
    PasswordStrengthMeterModule,
    ComponentsModule,
    LayoutModule,
    SettingCardModule,
  ],
  declarations: [AppSettingsPage],
})
export class AppSettingsPageModule {}
