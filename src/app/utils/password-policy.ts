import { zxcvbn } from '@zxcvbn-ts/core';
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
const COMMON_PASSWORDS = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'qwerty',
  'qwerty123',
  'abc123',
  '123123',
  '111111',
  '000000',
  '666666',
  'iloveyou',
  'admin',
  'welcome',
  'letmein',
  'secret',
  'passw0rd',
]);
export function isPasswordLongEnough(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}
export function hasUpperAndLower(password: string): boolean {
  return /[a-z]/.test(password) && /[A-Z]/.test(password);
}
export function hasNumber(password: string): boolean {
  return /\d/.test(password);
}
export function hasSpecialChar(password: string): boolean {
  return /[^a-zA-Z\d]/.test(password);
}
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
export function hasRepeatedChars(password: string): boolean {
  return /(.)\1{3,}/.test(password);
}
export function hasSequentialChars(password: string): boolean {
  const lower = password.toLowerCase();
  const sequences = [
    '0123456789',
    '9876543210',
    'abcdefghijklmnopqrstuvwxyz',
    'zyxwvutsrqponmlkjihgfedcba',
    'qwertyuiop',
    'poiuytrewq',
    'asdfghjkl',
    'lkjhgfdsa',
    'zxcvbnm',
    'mnbvcxz',
  ];
  return sequences.some((sequence) => {
    for (let i = 0; i <= sequence.length - 4; i++) {
      if (lower.includes(sequence.slice(i, i + 4))) {
        return true;
      }
    }
    return false;
  });
}
export function isPasswordAcceptable(password: string): boolean {
  if (!isPasswordLongEnough(password)) {
    return false;
  }
  if (isCommonPassword(password)) {
    return false;
  }
  if (hasRepeatedChars(password)) {
    return false;
  }
  if (hasSequentialChars(password)) {
    return false;
  }
  return true;
}
export function isPasswordWeak(password: string): boolean {
  if (!isPasswordAcceptable(password)) {
    return true;
  }
  const score = zxcvbn(password ?? '').score;
  return score <= 1;
}
export function shouldConfirmWeakPassword(password: string): boolean {
  return isPasswordAcceptable(password) && isPasswordWeak(password);
}
export function getWeakPasswordEducationKeys(password: string): string[] {
  const keys: string[] = [];
  if (!password?.length) {
    return keys;
  }
  if (isCommonPassword(password)) {
    keys.push('weakPasswordTipCommon');
  }
  if (hasSequentialChars(password)) {
    keys.push('weakPasswordTipSequence');
  }
  if (hasRepeatedChars(password)) {
    keys.push('weakPasswordTipRepeated');
  }
  if (!hasUpperAndLower(password)) {
    keys.push('weakPasswordTipMixCase');
  }
  if (!hasNumber(password)) {
    keys.push('weakPasswordTipAddNumber');
  }
  if (!hasSpecialChar(password)) {
    keys.push('weakPasswordTipAddSymbol');
  }
  const score = zxcvbn(password ?? '').score;
  if (score <= 1 && keys.length === 0) {
    keys.push('weakPasswordTipLessPredictable');
  }
  return [...new Set(keys)].slice(0, 2);
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
  const upperLower = hasUpperAndLower(password);
  const specialChar = hasSpecialChar(password);
  const strongPass = isPasswordLongEnough(password);
  const acceptable = isPasswordAcceptable(password);
  let score = zxcvbn(password ?? '').score;
  if (!acceptable) {
    score = 0;
  }
  let helperKey: PasswordStrengthHelperKey = 'greatPassword';
  if (!strongPass) {
    helperKey = 'passwordAtLeastLength';
  } else if (score <= 1) {
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
