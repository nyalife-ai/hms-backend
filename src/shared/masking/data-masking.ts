/**
 * PII-focused masking helpers. Distinct from `formatters/string.formatter`'s
 * generic `maskEmail`/`maskPhone`/`maskString` (which reveal both ends of a
 * value) — these keep only a trailing suffix visible, matching common
 * PCI/PII display conventions (e.g. card numbers, phone last-4).
 */

/** Masks all but the last `visible` characters of an email's local part. */
export function maskEmailAddress(email: string, visible = 2): string {
  const at = email.indexOf('@');
  if (at <= 0) {
    return maskValue(email, visible);
  }
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${maskValue(local, visible)}${domain}`;
}

/** Masks all but the last `visible` digits of a phone number, preserving a leading `+`. */
export function maskPhoneNumber(phone: string, visible = 2): string {
  const plus = phone.startsWith('+') ? '+' : '';
  const digits = plus ? phone.slice(1) : phone;
  return `${plus}${maskValue(digits, visible)}`;
}

/** Masks a card number, keeping only the last 4 digits visible (PCI-style). */
export function maskCardNumber(cardNumber: string): string {
  const digitsOnly = cardNumber.replace(/\D/g, '');
  if (digitsOnly.length <= 4) {
    return '*'.repeat(digitsOnly.length);
  }
  return `${'*'.repeat(digitsOnly.length - 4)}${digitsOnly.slice(-4)}`;
}

/** Generic masking helper: keeps the last `visible` characters, masks the rest. */
export function maskValue(value: string, visible = 4, maskChar = '*'): string {
  if (value.length <= visible) {
    return maskChar.repeat(value.length);
  }
  return `${maskChar.repeat(value.length - visible)}${value.slice(-visible)}`;
}

export type PiiFieldMasker = (value: string) => string;

export const PII_MASKERS: Readonly<Record<string, PiiFieldMasker>> = {
  email: maskEmailAddress,
  phone: maskPhoneNumber,
  card: maskCardNumber,
};

export interface MaskFieldsOptions {
  /** Field-name → masking strategy. Defaults to {@link PII_MASKERS} keyed lookup by field name. */
  readonly maskers?: Readonly<Record<string, PiiFieldMasker>>;
  /** Fields to mask with the generic {@link maskString} fallback when no specific masker matches. */
  readonly genericFields?: readonly string[];
}

/**
 * Returns a shallow copy of `record` with configured PII fields masked.
 * String values are masked in place; non-string values are left untouched.
 */
export function maskFields<T extends Record<string, unknown>>(
  record: T,
  fields: readonly (keyof T & string)[],
  options: MaskFieldsOptions = {},
): T {
  const maskers = options.maskers ?? PII_MASKERS;
  const genericFields = new Set(options.genericFields ?? []);
  const masked: Record<string, unknown> = { ...record };
  for (const field of fields) {
    const value = record[field];
    if (typeof value !== 'string') {
      continue;
    }
    const masker = genericFields.has(field) ? maskValue : maskers[field];
    masked[field] = masker ? masker(value) : maskValue(value);
  }
  return masked as T;
}
