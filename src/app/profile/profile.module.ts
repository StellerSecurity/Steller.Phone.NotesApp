import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProfileRoutingModule } from './profile-routing.module';
import { ProfileComponent } from './profile.component';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { LoginComponent } from './login/login.component';
import { CreateAccountComponent } from './create-account/create-account.component';


@NgModule({
  declarations: [ProfileComponent, LoginComponent, CreateAccountComponent],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ProfileRoutingModule,
    TranslateModule
  ]
})
export class ProfileModule { }
