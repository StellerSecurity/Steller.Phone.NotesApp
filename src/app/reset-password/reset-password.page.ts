import { Component, OnInit } from '@angular/core';
import {AlertController, NavController} from "@ionic/angular";

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss'],
})
export class ResetPasswordPage implements OnInit {

  constructor(public navController: NavController, private alertController: AlertController) { }

  ngOnInit() {
  }

  async resetNotes() {

    const alert = await this.alertController.create({
      header: 'WARNING',
      subHeader: 'PLEASE CONFIRM THAT YOU WANT TO THE RESET PASSWORD. IF YOU CONFIRM ALL NOTES STORED WILL BE DELETED ON YOUR DEVICE AND CANT BE RECOVERED !',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            // do nothing.
          },
        },
        {
          text: 'OK',
          role: 'confirm',
          handler: () => {
            localStorage.clear();
            this.navController.back();
          },
        }]
    });

    await alert.present();



  }

}
