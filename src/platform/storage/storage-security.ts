import { createHash, timingSafeEqual } from 'node:crypto';
import { ValidationException } from '../../core/exceptions/validation.exception';

const SEPARATORS = /[\\/]+/g;

function isControlCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
}

function stripControlCharacters(value: string): string {
  let output = '';
  for (const character of value) {
    if (!isControlCharacter(character)) {
      output += character;
    }
  }
  return output;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    if (isControlCharacter(character)) {
      return true;
    }
  }
  return false;
}

function invalid(message: string, field: string): never {
  throw new ValidationException(message, [{ field, message }]);
}

export function sanitizeFilename(filename: string): string {
  const sanitized = stripControlCharacters(filename)
    .replace(SEPARATORS, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .join('-')
    .trim();
  if (sanitized.length === 0) {
    return 'unnamed';
  }
  return sanitized;
}

export function assertAllowedContentType(
  contentType: string | undefined,
  allowlist: readonly string[],
): void {
  if (
    contentType !== undefined &&
    allowlist.length > 0 &&
    !allowlist.some(
      (allowed) =>
        allowed === contentType ||
        (allowed.endsWith('/*') &&
          contentType.startsWith(`${allowed.slice(0, -1)}`)),
    )
  ) {
    invalid('Content type is not allowed', 'contentType');
  }
}

export function assertWithinSizeLimit(bytes: number, maxBytes: number): void {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0 ||
    bytes > maxBytes
  ) {
    invalid('Object exceeds the configured size limit', 'size');
  }
}

export function assertSafeKey(key: string): void {
  if (
    key.length === 0 ||
    key.startsWith('/') ||
    key.includes('\\') ||
    hasControlCharacter(key) ||
    key.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    invalid('Storage key is unsafe', 'key');
  }
}

/** Computes the canonical SHA-256 hex checksum used across storage adapters. */
export function computeChecksum(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * Verifies a caller-supplied checksum against the computed digest of `body`
 * using a constant-time comparison. Accepts either raw SHA-256 hex digests
 * or `sha256:<hex>` prefixed values.
 */
export function verifyChecksum(
  body: Buffer,
  expectedChecksum: string,
): boolean {
  const expected = expectedChecksum.includes(':')
    ? expectedChecksum.slice(expectedChecksum.indexOf(':') + 1)
    : expectedChecksum;
  const actual = computeChecksum(body);
  const expectedBuffer = Buffer.from(expected.toLowerCase(), 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return (
    expectedBuffer.length === actualBuffer.length &&
    expectedBuffer.length > 0 &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

/** Throws a {@link ValidationException} when the checksum does not match. */
export function assertChecksumMatches(
  body: Buffer,
  expectedChecksum: string | undefined,
): void {
  if (
    expectedChecksum !== undefined &&
    !verifyChecksum(body, expectedChecksum)
  ) {
    invalid('Object checksum does not match the expected value', 'checksum');
  }
}
