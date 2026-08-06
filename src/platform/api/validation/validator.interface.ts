export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors?: readonly ValidationError[];
}

export interface Validator<T> {
  validate(value: T): ValidationResult | Promise<ValidationResult>;
  sanitize?(value: T): T | Promise<T>;
}
