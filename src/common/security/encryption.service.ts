import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from 'crypto';

/**
 * Secure Encryption Service.
 *
 * Provides versioned AES-256-GCM authenticated encryption for sensitive
 * payloads using Node's native `crypto` module (no third-party crypto libs).
 *
 * Wire format (base64url, delimited):
 *   v1.<iv>.<authTag>.<ciphertext>
 * where IV is 12 bytes and authTag is 16 bytes.
 *
 * Decryption is authenticated by GCM: `setAuthTag` + `final()` reject
 * tampered ciphertext/tag without returning partial plaintext.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;
  private readonly algorithm = 'aes-256-gcm' as const;

  private static readonly VERSION = 'v1';
  private static readonly IV_LENGTH = 12;
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly PARTS = 4;

  /** Static salt used only when deriving a 32-byte key from a shorter secret. */
  private static readonly KEY_DERIVATION_SALT = 'api-encryption-salt-v1';

  constructor(private readonly configService: ConfigService) {
    const rawKey =
      this.configService.get<string>('ENCRYPTION_SECRET_KEY') ||
      this.configService.get<string>('encryption.secretKey');

    if (!rawKey) {
      this.logger.error('Encryption secret key not found in configuration');
      throw new InternalServerErrorException('Encryption key not configured');
    }

    const trimmedKey = rawKey.trim();

    /**
     * AES-256 requires a 32-byte key. If the provided secret is exactly 32
     * characters it is used directly; otherwise a secure key is derived via
     * scrypt so the service still boots without crashing.
     */
    if (trimmedKey.length === 32) {
      this.key = Buffer.from(trimmedKey, 'utf8');
    } else {
      this.logger.warn(
        'Provided encryption key is not 32 bytes; deriving a secure key via scrypt',
      );
      this.key = scryptSync(
        trimmedKey,
        EncryptionService.KEY_DERIVATION_SALT,
        32,
      );
    }

    this.logger.log('Encryption service initialised');
  }

  /**
   * Encrypts a UTF-8 string and returns a versioned GCM payload.
   */
  encryptPayload(data: string): string {
    try {
      const iv = randomBytes(EncryptionService.IV_LENGTH);
      const cipher = createCipheriv(this.algorithm, this.key, iv);

      const ciphertext = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return [
        EncryptionService.VERSION,
        toBase64Url(iv),
        toBase64Url(authTag),
        toBase64Url(ciphertext),
      ].join('.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error('Encryption failed', { error: message });
      throw new BadRequestException('Failed to encrypt payload');
    }
  }

  /**
   * Decrypts a versioned GCM payload back to its original UTF-8 string.
   * Tampered, truncated, or unknown-version payloads are rejected uniformly.
   */
  decryptPayload(encrypted: string): string {
    if (!encrypted || typeof encrypted !== 'string') {
      throw new BadRequestException('Invalid encrypted token');
    }

    try {
      const parts = encrypted.split('.');
      if (parts.length !== EncryptionService.PARTS) {
        throw new Error('invalid structure');
      }

      const [version, ivPart, tagPart, ciphertextPart] = parts;
      if (version !== EncryptionService.VERSION) {
        throw new Error('unknown version');
      }

      const iv = fromBase64Url(ivPart);
      const authTag = fromBase64Url(tagPart);
      const ciphertext = fromBase64Url(ciphertextPart);

      if (
        iv.length !== EncryptionService.IV_LENGTH ||
        authTag.length !== EncryptionService.AUTH_TAG_LENGTH
      ) {
        throw new Error('invalid lengths');
      }

      const decipher = createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      throw new BadRequestException('Invalid or corrupted encrypted token');
    }
  }

  /**
   * Decrypts a payload and parses it as JSON.
   */
  parsePayload(encrypted: string): Record<string, unknown> {
    try {
      const decryptedString = this.decryptPayload(encrypted);
      return JSON.parse(decryptedString) as Record<string, unknown>;
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid payload format after decryption');
    }
  }
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error('invalid encoding');
  }
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}
