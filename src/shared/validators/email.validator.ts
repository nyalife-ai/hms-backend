import { EMAIL_REGEX } from '../constants/regex.constants';

export const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 254 && EMAIL_REGEX.test(value);
