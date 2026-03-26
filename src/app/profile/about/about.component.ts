import { Component } from '@angular/core';
import { AppHapticsService } from '../../services/app-haptics.service';

@Component({
  selector: 'app-about',
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss'],
})
export class AboutComponent {
  constructor(private appHaptics: AppHapticsService) {}

  openPrivacyPolicy() {
    this.appHaptics.tap();
    window.open('https://stellarsecurity.com/privacy-page', '_blank');
  }

  openTermsPage() {
    this.appHaptics.tap();
    window.open('https://stellarsecurity.com/terms-page', '_blank');
  }

  openContactUs() {
    this.appHaptics.tap();
    window.open('https://stellarsecurity.com/contact-us', '_blank');
  }

  openGithub() {
    this.appHaptics.tap();
    window.open('https://github.com/StellerSecurity/Steller.Phone.NotesApp', '_blank');
  }

  openStellarSecurity() {
    this.appHaptics.tap();
    window.open('https://stellarsecurity.com/', '_blank');
  }
}
