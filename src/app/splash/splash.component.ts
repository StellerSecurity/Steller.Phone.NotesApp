import { Component, OnInit } from '@angular/core';
import { NavController } from '@ionic/angular';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrls: ['./splash.component.scss'],
})
export class SplashComponent {
  constructor(private navController: NavController) {}

  ngAfterViewInit() {
    setTimeout(() => {
      this.navController.navigateForward('home');
    }, 1500);
  }
}
