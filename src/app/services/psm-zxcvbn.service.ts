import { Injectable } from '@angular/core';
import { IPasswordStrengthMeterService, FeedbackResult } from 'angular-password-strength-meter';
import { zxcvbn } from '@zxcvbn-ts/core';

@Injectable()
export class PsmZxcvbnService extends IPasswordStrengthMeterService {
  score(password: string): number {
    return zxcvbn(password ?? '').score;
  }

  scoreWithFeedback(password: string): FeedbackResult {
    const res = zxcvbn(password ?? '');
    return {
      score: res.score,
      feedback: {
        warning: res.feedback?.warning ?? '',
        suggestions: res.feedback?.suggestions ?? [],
      },
    };
  }

  async scoreAsync(password: string): Promise<number> {
    return this.score(password);
  }

  async scoreWithFeedbackAsync(password: string): Promise<FeedbackResult> {
    return this.scoreWithFeedback(password);
  }
}
