/**
 * Magic-byte based image validation. Never trust a client-supplied MIME type
 * or file extension — sniff the actual bytes before doing anything with an
 * uploaded image.
 */
export type ImageFormat = 'jpeg' | 'png' | 'gif' | 'webp';

export class ImageValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

interface ImageSignature {
  readonly format: ImageFormat;
  readonly matches: (buffer: Buffer) => boolean;
}

const SIGNATURES: readonly ImageSignature[] = [
  {
    format: 'png',
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a,
  },
  {
    format: 'jpeg',
    matches: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  {
    format: 'gif',
    matches: (buffer) =>
      buffer.length >= 6 &&
      buffer.toString('ascii', 0, 3) === 'GIF' &&
      (buffer.toString('ascii', 3, 6) === '87a' ||
        buffer.toString('ascii', 3, 6) === '89a'),
  },
  {
    format: 'webp',
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP',
  },
];

/** Returns the detected image format, or `undefined` when unrecognized. */
export function detectImageFormat(buffer: Buffer): ImageFormat | undefined {
  return SIGNATURES.find((signature) => signature.matches(buffer))?.format;
}

export interface ImageValidationOptions {
  /** Maximum accepted byte size. Defaults to 20 MiB. */
  readonly maxBytes?: number;
  /** Allowed formats. Defaults to all recognized formats. */
  readonly allowedFormats?: readonly ImageFormat[];
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_ALLOWED_FORMATS: readonly ImageFormat[] = [
  'jpeg',
  'png',
  'gif',
  'webp',
];

/**
 * Validates an image buffer's size and magic bytes.
 *
 * @throws {ImageValidationError} when the buffer is empty, too large, an
 * unrecognized format, or a format that is not in `allowedFormats`.
 * @returns the detected {@link ImageFormat}.
 */
export function validateImageBuffer(
  buffer: Buffer,
  options: ImageValidationOptions = {},
): ImageFormat {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowedFormats = options.allowedFormats ?? DEFAULT_ALLOWED_FORMATS;

  if (buffer.length === 0) {
    throw new ImageValidationError('Image buffer is empty');
  }
  if (buffer.length > maxBytes) {
    throw new ImageValidationError(
      `Image exceeds maximum size of ${maxBytes} bytes`,
    );
  }
  const format = detectImageFormat(buffer);
  if (!format) {
    throw new ImageValidationError(
      'Unrecognized image format (magic bytes did not match any known signature)',
    );
  }
  if (!allowedFormats.includes(format)) {
    throw new ImageValidationError(`Image format "${format}" is not allowed`);
  }
  return format;
}
