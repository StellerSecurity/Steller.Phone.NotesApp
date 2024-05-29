import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, PasswordStrengthMeterModule.forRoot(), IonicModule.forRoot({innerHTMLTemplatesEnabled: true}), AppRoutingModule, CommonModule, FormsModule],
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
  bootstrap: [AppComponent],
})
export class AppModule {}
