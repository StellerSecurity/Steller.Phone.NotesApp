import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'note-password-input',
  templateUrl: './password-input.component.html',
  styleUrls: ['./password-input.component.scss'],
})
export class PasswordInputComponent implements OnInit {
  constructor() {}

  public colors = ['danger', 'warning', 'primary', 'success', 'note-green'];

  public passwordStrengthHelperText = '';
  public passwordStrength = 0;
  public inputType: 'password' | 'normal' = 'password';
  public isPwsShow: boolean = false;
  public strengthStatus: string = '';
  public strengthLevel: number;
  public strengthHelperText: string = '';

  @Input() variant: 'normal' | 'strength' = 'normal';
  @Input() value: string = '';
  @Input() placeholder?: string = '';
  @Input() label?: string = '';
  @Output() changeEvent: EventEmitter<any> = new EventEmitter<any>();
  public notesAppPassword = '';

  ngOnInit() {}

  public handleChangeEvent($event: any) {
    this.changeEvent.emit($event);
    // Initialize variables
    var tips = '';

    this.passwordStrength = 0;

    if (this.notesAppPassword.length == 0) {
      this.passwordStrengthHelperText = '';
      return;
    }

    // Check password length
    if (this.notesAppPassword.length < 6) {
      tips += 'Make the password longer. ';
    } else {
      this.passwordStrength += 1;
    }

    // Check for mixed case
    if (
      this.notesAppPassword.match(/[a-z]/) &&
      this.notesAppPassword.match(/[A-Z]/)
    ) {
      this.passwordStrength += 1;
    } else {
      tips += 'Use both lowercase and uppercase letters. ';
    }

    // Check for numbers
    if (this.notesAppPassword.match(/\d/)) {
      this.passwordStrength += 1;
    } else {
      tips += 'Include at least one number. ';
    }

    // Check for special characters
    if (this.notesAppPassword.match(/[^a-zA-Z\d]/)) {
      this.passwordStrength += 1;
    } else {
      tips += 'Include at least one special character. ';
    }

    // Return results
    if (this.passwordStrength < 2) {
      this.passwordStrengthHelperText = 'Easy to guess. ' + tips;
    } else if (this.passwordStrength === 2) {
      this.passwordStrengthHelperText = 'Medium difficulty. ' + tips;
    } else if (this.passwordStrength === 3) {
      this.passwordStrengthHelperText = 'Difficult. ' + tips;
    } else {
      this.passwordStrengthHelperText = 'Extremely difficult.x ' + tips;
    }
  }

  changePasswordStrength($event: {
    helperText: string;
    strengthStatus: string;
    strengthLevel: number;
  }) {
    this.strengthHelperText = $event.helperText;
    this.strengthLevel = $event.strengthLevel;
    this.strengthStatus = $event.strengthStatus;
  }

  public toggleShowPws() {
    this.isPwsShow = !this.isPwsShow;
    this.inputType = this.isPwsShow ? 'normal' : 'password';
  }
}
