export type PasswordFailure =
  'length' | 'uppercase' | 'lowercase' | 'digit' | 'symbol';
export interface PasswordStrength {
  readonly valid: boolean;
  readonly score: number;
  readonly failures: readonly PasswordFailure[];
}

export const validatePassword = (
  value: unknown,
  minimumLength = 8,
): PasswordStrength => {
  const password = typeof value === 'string' ? value : '';
  const checks: readonly [PasswordFailure, boolean][] = [
    ['length', password.length >= minimumLength],
    ['uppercase', /\p{Lu}/u.test(password)],
    ['lowercase', /\p{Ll}/u.test(password)],
    ['digit', /\p{N}/u.test(password)],
    ['symbol', /[^\p{L}\p{N}\s]/u.test(password)],
  ];
  const failures = checks.filter((check) => !check[1]).map((check) => check[0]);
  const score = checks.length - failures.length;
  return { valid: failures.length === 0, score, failures };
};
