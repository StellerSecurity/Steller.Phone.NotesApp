import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { LayoutModule } from './layout/layout.module';
import { ComponentsModule } from './components/components.module';
import { WelcomeComponent } from './welcome/welcome.component';
import { SplashComponent } from './splash/splash.component';

@NgModule({
  declarations: [AppComponent, WelcomeComponent, SplashComponent],
  imports: [
    BrowserModule,
    PasswordStrengthMeterModule.forRoot(),
    IonicModule.forRoot({ innerHTMLTemplatesEnabled: true }),
    AppRoutingModule,
    ComponentsModule,
    LayoutModule,
  ],
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
  bootstrap: [AppComponent],
})
export class AppModule {}
