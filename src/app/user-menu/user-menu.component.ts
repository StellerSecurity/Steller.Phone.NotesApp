import { Component, OnInit } from "@angular/core";
import { ModalController, PopoverController } from "@ionic/angular";
import { AppSettingsPage } from "../app-settings/app-settings.page";
import { Router } from "@angular/router";

@Component({
  selector: "app-user-menu",
  templateUrl: "./user-menu.component.html",
  styleUrls: ["./user-menu.component.scss"],
})
export class UserMenuComponent {
  isUserIsLoggedIn = false;

  constructor(
    private popoverController: PopoverController,
    private modalController: ModalController,
    private router: Router
  ) {}

  openSettings() {
    this.popoverController.dismiss();
    // navigate to settings page
  }

  logout() {
    this.popoverController.dismiss();
    // perform logout
  }

  async openSettingsModal() {
    const modal = await this.modalController.create({
      component: AppSettingsPage,
      cssClass: "centered-modal",
      backdropDismiss: true,
      showBackdrop: true,
      animated: true,
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
    console.log("Modal data:", data);
  }

  goToLogin(): void {
    this.router.navigate(['/profile/login']);
  }
}
