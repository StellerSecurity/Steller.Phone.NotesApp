import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { PasswordStrengthMeterModule } from 'angular-password-strength-meter';
import { AngularEditorModule } from '@wfpena/angular-wysiwyg';
import { HttpClientModule} from '@angular/common/http';

@NgModule({
  declarations: [AppComponent],
  imports: [HttpClientModule, AngularEditorModule, BrowserModule, PasswordStrengthMeterModule.forRoot(), IonicModule.forRoot({innerHTMLTemplatesEnabled: true}), AppRoutingModule, CommonModule, FormsModule],
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
  bootstrap: [AppComponent],
})
export class AppModule {}
