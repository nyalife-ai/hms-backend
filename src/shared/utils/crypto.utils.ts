import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type RandomBytesSource = (size: number) => Uint8Array;

export const sha256Hex = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');
export const hmacSha256Hex = (
  value: string | Uint8Array,
  key: string | Uint8Array,
): string => createHmac('sha256', key).update(value).digest('hex');
export const randomHex = (
  byteLength: number,
  source: RandomBytesSource,
): string => {
  if (!Number.isInteger(byteLength) || byteLength < 0)
    throw new RangeError('Byte length must be a non-negative integer');
  const bytes = source(byteLength);
  if (bytes.byteLength !== byteLength)
    throw new RangeError('Random source returned an unexpected byte length');
  return Buffer.from(bytes).toString('hex');
};
export const constantTimeEqual = (
  left: string | Uint8Array,
  right: string | Uint8Array,
): boolean => {
  const leftBytes =
    typeof left === 'string' ? Buffer.from(left) : Buffer.from(left);
  const rightBytes =
    typeof right === 'string' ? Buffer.from(right) : Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    const size = Math.max(leftBytes.length, rightBytes.length);
    const paddedLeft = Buffer.alloc(size);
    const paddedRight = Buffer.alloc(size);
    leftBytes.copy(paddedLeft);
    rightBytes.copy(paddedRight);
    timingSafeEqual(paddedLeft, paddedRight);
    return false;
  }
  return timingSafeEqual(leftBytes, rightBytes);
};
export const base64UrlEncode = (value: string | Uint8Array): string =>
  Buffer.from(value).toString('base64url');
export const base64UrlDecode = (value: string): Uint8Array =>
  new Uint8Array(Buffer.from(value, 'base64url'));
export const base64UrlDecodeText = (value: string): string =>
  Buffer.from(value, 'base64url').toString('utf8');
