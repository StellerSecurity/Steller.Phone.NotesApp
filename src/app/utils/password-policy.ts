export const PASSWORD_MIN_LENGTH = 6;

export type PasswordStrengthHelperKey =
  | 'passwordAtLeastLength'
  | 'weakPassword'
  | 'averagePassword'
  | 'goodPassword'
  | 'greatPassword';

export interface PasswordStrengthResult {
  score: number;
  upperLower: boolean;
  specialChar: boolean;
  strongPass: boolean;
  helperKey: PasswordStrengthHelperKey;
}

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password.length) {
    return {
      score: 0,
      upperLower: false,
      specialChar: false,
      strongPass: false,
      helperKey: 'passwordAtLeastLength',
    };
  }

  let score = 0;
  const upperLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const specialChar = /[^a-zA-Z\d]/.test(password);
  const strongPass = isPasswordLongEnough(password);

  if (strongPass) {
    score += 1;
  }
  if (upperLower) {
    score += 1;
  }
  if (hasNumber) {
    score += 1;
  }
  if (specialChar) {
    score += 1;
  }
  if (strongPass) {
    score += 1;
  }

  let helperKey: PasswordStrengthHelperKey = 'greatPassword';
  if (score < 2) {
    helperKey = 'weakPassword';
  } else if (score === 2) {
    helperKey = 'averagePassword';
  } else if (score === 3) {
    helperKey = 'goodPassword';
  }

  return {
    score,
    upperLower,
    specialChar,
    strongPass,
    helperKey,
  };
}
