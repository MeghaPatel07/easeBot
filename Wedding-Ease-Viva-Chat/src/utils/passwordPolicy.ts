import { COMMON_PASSWORDS } from './commonPasswords';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordIssue =
  | 'tooShort'
  | 'tooLong'
  | 'missingLower'
  | 'missingUpper'
  | 'missingDigit'
  | 'missingSymbol'
  | 'tooCommon';

const SYMBOL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;

export function validatePassword(
  pw: string,
): { ok: boolean; issues: PasswordIssue[]; score: 0 | 1 | 2 | 3 | 4 } {
  const issues: PasswordIssue[] = [];
  if (pw.length < PASSWORD_MIN_LENGTH) issues.push('tooShort');
  if (pw.length > PASSWORD_MAX_LENGTH) issues.push('tooLong');

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = SYMBOL_RE.test(pw);
  if (!hasLower) issues.push('missingLower');
  if (!hasUpper) issues.push('missingUpper');
  if (!hasDigit) issues.push('missingDigit');
  if (!hasSymbol) issues.push('missingSymbol');

  const common = COMMON_PASSWORDS.has(pw.toLowerCase());
  if (common) issues.push('tooCommon');

  let score = 0;
  if (hasLower) score++;
  if (hasUpper) score++;
  if (hasDigit) score++;
  if (hasSymbol) score++;
  // Length and denylist act as hard caps — a complex-looking but short or
  // breached password must never surface as "strong".
  if (pw.length < PASSWORD_MIN_LENGTH && score > 1) score = 1;
  if (common) score = 0;
  if (score < 0) score = 0;
  if (score > 4) score = 4;

  return {
    ok: issues.length === 0,
    issues,
    score: score as 0 | 1 | 2 | 3 | 4,
  };
}

export function describeIssue(i: PasswordIssue): string {
  switch (i) {
    case 'tooShort':
      return 'At least 10 characters';
    case 'tooLong':
      return 'Too long (max 128)';
    case 'missingLower':
      return 'One lowercase letter';
    case 'missingUpper':
      return 'One uppercase letter';
    case 'missingDigit':
      return 'One number';
    case 'missingSymbol':
      return 'One symbol';
    case 'tooCommon':
      return 'Too common — pick something unique';
  }
}
