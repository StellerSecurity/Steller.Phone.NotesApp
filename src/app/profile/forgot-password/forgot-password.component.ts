import { Component, OnInit } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "src/app/services/auth.service";

@Component({
  selector: "app-forgot-password",
  templateUrl: "./forgot-password.component.html",
  styleUrls: ["./forgot-password.component.scss"],
})
export class ForgotPasswordComponent implements OnInit {
  email = "email";
  showVerification = false;
  otpValue = "";
  otpConfig = {
    length: 4,
    inputClass: "bottom-border-otp", // must match your CSS class
    allowNumbersOnly: false,
    isPasswordInput: false,
    disableAutoFocus: false,
    placeholder: " ",
  };
  forgotPasswordForm: FormGroup;
  isProcessing = false;

  constructor(private router: Router, private fb: FormBuilder, private authService: AuthService) {}

  ngOnInit(): void {
    this.initForgotPasswordForm();
  }

  initForgotPasswordForm(): void {
    this.forgotPasswordForm = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
    });
  }
  
  sendCode() {
    // Optionally call API to send code to this.email
    if (this.forgotPasswordForm.valid) {
      this.email = this.forgotPasswordForm.get('email')?.value;
      this.isProcessing = true;
      this.authService.forgotPassword(this.forgotPasswordForm.get('email')?.value).subscribe({
        next: (response) => {
          this.isProcessing = false;
          if (response.response_code == 200) {
            this.showVerification = true;        
          } else {
            // this.toastrService.error(response.response_message);
          }
        },
        error: (error) => {
          this.isProcessing = false;
          // this.toastrService.error(error?.error?.message);
        }
      })
    }
  }

  resendCode() {
    console.log("Resend code to", this.email);
  }

  useDifferentEmail() {
    this.showVerification = false;
  }

  onOtpChange(value: string) {
    this.otpValue = value;
  }

  goToBack(): void {
    if (!this.showVerification) {
      this.router.navigate(["/profile/login"]);
    } else {
      this.showVerification = false;
    }
  }
}
