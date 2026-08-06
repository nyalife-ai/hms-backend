import { Injectable } from '@nestjs/common';
import { ValidationException } from '../../../core';

export interface PasswordPolicyOptions {
  readonly minLength?: number;
  readonly requireUppercase?: boolean;
  readonly requireLowercase?: boolean;
  readonly requireNumber?: boolean;
  readonly requireSymbol?: boolean;
}

@Injectable()
export class PasswordPolicy {
  public constructor(private readonly options: PasswordPolicyOptions = {}) {}

  public validate(password: string): void {
    const errors: Array<{ field: string; message: string }> = [];
    const min = this.options.minLength ?? 12;
    if (password.length < min)
      errors.push({
        field: 'password',
        message: `Must contain at least ${min} characters`,
      });
    if ((this.options.requireUppercase ?? true) && !/[A-Z]/.test(password))
      errors.push({
        field: 'password',
        message: 'Must contain an uppercase letter',
      });
    if ((this.options.requireLowercase ?? true) && !/[a-z]/.test(password))
      errors.push({
        field: 'password',
        message: 'Must contain a lowercase letter',
      });
    if ((this.options.requireNumber ?? true) && !/\d/.test(password))
      errors.push({ field: 'password', message: 'Must contain a number' });
    if ((this.options.requireSymbol ?? true) && !/[^A-Za-z0-9]/.test(password))
      errors.push({ field: 'password', message: 'Must contain a symbol' });
    if (errors.length > 0)
      throw new ValidationException('Password does not satisfy policy', errors);
  }
}
