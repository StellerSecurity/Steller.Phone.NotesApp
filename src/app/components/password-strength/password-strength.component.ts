import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChange,
} from '@angular/core';

@Component({
  selector: 'note-password-strength',
  styleUrls: ['./password-strength.component.scss'],
  templateUrl: './password-strength.component.html',
})
export class PasswordStrengthComponent implements OnChanges {
  bar0: string;
  bar1: string;
  bar2: string;
  bar3: string;
  bar4: string;

  private strengthStatus: string = '';
  public helperText = '';
  public strengthLevel = 0;

  @Input() passwordToCheck: string;

  @Output() checkStrengthEvent = new EventEmitter<{
    helperText: string;
    strengthStatus: string;
    strengthLevel: number;
  }>();

  private colors = ['darkred', 'orangered', 'orange', 'yellowgreen', '#08B805'];

  message: string;
  messageColor: string;

  ngOnChanges(changes: { [propName: string]: SimpleChange }): void {
    const password = changes['passwordToCheck'].currentValue;

    this.setBarColors(5, '#DDD');

    if (password) {
      this.checkStrength(password);

      this.setBarColors(
        this.strengthLevel + 1,
        this.colors[this.strengthLevel]
      );

      this.checkStrengthEvent.emit({
        helperText: this.helperText,
        strengthLevel: this.strengthLevel,
        strengthStatus: this.strengthStatus,
      });
    }
  }

  private setBarColors(count: number, color: string) {
    console.log(count);
    for (let n = 0; n < count; n++) {
      (this as any)['bar' + n] = color;
    }
  }

  public checkStrength(password: string) {
    // Initialize variables
    var tips = '';
    this.strengthLevel = 0;

    if (password.length == 0) {
      this.helperText = '';
      return;
    }

    // Check password length
    if (password.length < 6) {
      tips += 'Make the password longer. ';
    } else {
      this.strengthLevel += 1;
    }

    // Check for mixed case
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) {
      this.strengthLevel += 1;
    } else {
      tips += 'Use both lowercase and uppercase letters. ';
    }

    // Check for numbers
    if (password.match(/\d/)) {
      this.strengthLevel += 1;
    } else {
      tips += 'Include at least one number. ';
    }

    // Check for special characters
    if (password.match(/[$-/:-?{-~!"^_@`\[\]]/g)) {
      this.strengthLevel += 1;
    } else {
      tips += 'Include at least one special character. ';
    }

    // Return results
    if (this.strengthLevel < 2) {
      this.strengthStatus = 'Easy to guess';
      this.helperText = tips;
    } else if (this.strengthLevel === 2) {
      this.strengthStatus = 'Medium difficulty';
      this.helperText = tips;
    } else if (this.strengthLevel === 3) {
      this.strengthStatus = 'Difficult';
      this.helperText = tips;
    } else {
      this.strengthStatus = 'Extremely difficult';
      this.helperText = tips;
    }
  }
}
