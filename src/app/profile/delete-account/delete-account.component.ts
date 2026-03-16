import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { DataService } from 'src/app/services/data.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';

@Component({
  selector: 'app-delete-account',
  templateUrl: './delete-account.component.html',
  styleUrls: ['./delete-account.component.scss'],
})
export class DeleteAccountComponent implements OnInit {
  deleteForm!: FormGroup;
  isSaving = false;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private alertController: AlertController,
    private authService: AuthService,
    private dataService: DataService,
    private toastMessageService: ToastMessageService,
  ) {}

  ngOnInit(): void {
    this.deleteForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      confirmDelete: [false, [Validators.requiredTrue]],
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  async submitDeleteRequest() {
    if (this.deleteForm.invalid || this.isSaving) {
      this.deleteForm.markAllAsTouched();
      return;
    }

    const alert = await this.alertController.create({
      header: 'Delete account?',
      message: 'This permanently deletes your Stellar ID for Notes and cannot be undone.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.performDelete();
          },
        },
      ],
    });

    await alert.present();
  }

  private async performDelete() {
    this.isSaving = true;

    try {
      const response: any = await firstValueFrom(
        this.authService.deleteAccount(this.deleteForm.get('currentPassword')?.value),
      );

      if (response?.response_code === 200) {
        await this.toastMessageService.showSuccess(response?.response_message ?? 'Account deleted successfully.');
        await this.dataService.clearAppData();
        await this.authService.initializeAuthState();
        window.location.href = '/';
        return;
      }

      await this.toastMessageService.showError(response?.response_message ?? 'Unable to delete account.');
    } catch (error: any) {
      await this.toastMessageService.showError(error?.error?.response_message ?? error?.error?.message ?? 'Unable to delete account.');
    } finally {
      this.isSaving = false;
    }
  }

  goBack() {
    this.router.navigate(['/profile']);
  }
}
