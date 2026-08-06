import { generateId } from '../../../core';

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const MAX_CORRELATION_ID_LENGTH = 128;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export type HeaderValue = string | readonly string[] | undefined;

export function generateCorrelationId(): string {
  return generateId('correlation');
}

export function resolveCorrelationId(value: HeaderValue): string {
  let candidate: string | undefined;
  if (typeof value === 'string') {
    candidate = value;
  } else if (isStringArray(value)) {
    candidate = value[0];
  }
  const normalized = candidate?.trim();
  return normalized !== undefined && isValidCorrelationId(normalized)
    ? normalized
    : generateCorrelationId();
}

export function correlationHeaders(
  correlationId: string,
): Readonly<Record<string, string>> {
  const normalized = correlationId.trim();
  if (!isValidCorrelationId(normalized)) {
    throw new Error('Correlation id has an invalid length or character');
  }
  return { [CORRELATION_ID_HEADER]: normalized };
}

export function isValidCorrelationId(value: string): boolean {
  return (
    value.length <= MAX_CORRELATION_ID_LENGTH &&
    CORRELATION_ID_PATTERN.test(value)
  );
}

function isStringArray(value: HeaderValue): value is readonly string[] {
  return (
    Array.isArray(value) && (value.length === 0 || typeof value[0] === 'string')
  );
}
