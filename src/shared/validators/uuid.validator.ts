import { UUID_V4_REGEX } from '../constants/regex.constants';
import type { Uuid } from '../types/identifier.types';

export const isValidUuid = (value: unknown): value is Uuid =>
  typeof value === 'string' && UUID_V4_REGEX.test(value);
