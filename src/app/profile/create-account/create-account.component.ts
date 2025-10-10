import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';
import {NotesService} from "../../services/notes.service";
import {NotesApiV1Service} from "../../services/notes-api-v1.service";

@Component({
  selector: 'app-create-account',
  templateUrl: './create-account.component.html',
  styleUrls: ['./create-account.component.scss'],
})
export class CreateAccountComponent implements OnInit {
  email = '';
  password = '';
  showPassword = false;
  showVerificationSection = false;
  otpValue = '';
  otpConfig = {
    length: 4,
    inputClass: 'bottom-border-otp', // must match your CSS class
    allowNumbersOnly: false,
    isPasswordInput: false,
    disableAutoFocus: false,
    placeholder: ' ',
  };
  createUserForm: FormGroup;
  isSaving = false;

  constructor(private router: Router, private fb: FormBuilder,
    private notesService: NotesService,
    private notesApiV1Service: NotesApiV1Service,
    private authService: AuthService, private toastMessageService: ToastMessageService) {}

  ngOnInit(): void {
    this.initCreateUserForm();
  }

  initCreateUserForm(): void {
    this.createUserForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required,
        Validators.minLength(6),   // example rule
      ]]
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  createAccount() {
    // Simulate API call and show verification
    if (this.createUserForm.valid) {
      this.isSaving = true;
      const createUserObj = {
        username: this.createUserForm.get("email")?.value,
        password: this.createUserForm.get("password")?.value,
      };
      this.authService.createAccount(createUserObj).subscribe({
        next: (response) => {
          this.isSaving = false;
          if (response.response_code == 200) {
            // this.showVerificationSection = true;
            localStorage.setItem("ssToken", response.token);
            localStorage.setItem("ssUser", JSON.stringify(response.user));
            this.notesApiV1Service.upload(0, JSON.parse(this.notesService.getDecryptedNotes())).subscribe(res => {});
            this.router.navigate(["/"]);
          } else {
            this.toastMessageService.showError(response.response_message);
          }
        },
        error: (error) => {
          this.isSaving = false;
          this.toastMessageService.showError(error?.error?.message);
        },
      });
    }
  }

  goToLogin() {
    this.router.navigate(['/profile/login']);
  }

  resendCode() {
    console.log('Resend code to:', this.email);
  }

  changeEmail() {
    this.showVerificationSection = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;
  }
  
  
}
