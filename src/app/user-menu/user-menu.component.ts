import { Component, OnInit } from '@angular/core';
import { PopoverController } from '@ionic/angular';

@Component({
  selector: 'app-user-menu',
  templateUrl: './user-menu.component.html',
  styleUrls: ['./user-menu.component.scss'],
})
export class UserMenuComponent {
  isUserIsLoggedIn = false;

  constructor(private popoverController: PopoverController) {}

  openSettings() {
    this.popoverController.dismiss();
    // navigate to settings page
  }

  logout() {
    this.popoverController.dismiss();
    // perform logout
  }
}