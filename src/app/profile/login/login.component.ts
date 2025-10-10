import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { loginDto } from 'src/app/constants/models/authDto';
import { AuthService } from 'src/app/services/auth.service';
import { ToastMessageService } from 'src/app/services/toast-message.service';
import {NotesService} from "../../services/notes.service";
import {NotesApiV1Service} from "../../services/notes-api-v1.service";

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  showPassword = false;
  loginForm: FormGroup;
  isSaving = false;

  constructor(private router: Router, private fb: FormBuilder,
     private notesService: NotesService,
     private notesApiV1Service: NotesApiV1Service,
     private authService: AuthService, private toastMessageService: ToastMessageService) {}


  ngOnInit(): void {
    this.initLoginForm();
  }

  initLoginForm(): void {
    this.loginForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required]],
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  login() {
    if (this.loginForm.valid) {
      this.isSaving = true;
      const loginObj: loginDto = {
        username: this.loginForm.get("email")?.value,
        password: this.loginForm.get("password")?.value,
      };

      this.authService.loginHandling(loginObj).subscribe({
        next: (response:any) => {
          this.isSaving = false;
          if (response.response_code == 200) {
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

  navigateToRegister() {
    this.router.navigate(['/profile/create-account']);
  }

  forgotPassword() {
    this.router.navigate(['/profile/forgot-password']);
  }
}
