import { capitalize, maskSecret, truncate } from '../utils/string.utils';

export const maskEmail = (value: string): string => {
  const at = value.indexOf('@');
  if (at <= 0) return maskSecret(value);
  return `${maskSecret(value.slice(0, at), 1, 0)}${value.slice(at)}`;
};
export const maskPhone = (value: string): string =>
  maskSecret(value, 0, Math.min(4, value.length));
export const maskString = (
  value: string,
  visibleStart = 0,
  visibleEnd = 0,
): string => maskSecret(value, visibleStart, visibleEnd);
export const ellipsis = (value: string, maxLength: number): string =>
  truncate(value, maxLength);
export const titleCase = (value: string): string =>
  value
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => capitalize(word.toLocaleLowerCase()))
    .join(' ');
