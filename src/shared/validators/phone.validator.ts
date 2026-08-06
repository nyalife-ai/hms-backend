import { E164_PHONE_REGEX } from '../constants/regex.constants';

export const isValidE164Phone = (value: unknown): value is string =>
  typeof value === 'string' && E164_PHONE_REGEX.test(value);
