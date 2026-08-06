import { Injectable } from '@nestjs/common';
import {
  constants,
  createCipheriv,
  createDecipheriv,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from 'node:crypto';
import { DomainException } from '../../../core';
import type { EncryptedValue, EncryptionKey } from './encryption.types';

const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;
const ALGORITHM = 'aes-256-gcm' as const;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * AES-256-GCM + RSA-OAEP encryption helpers with key-version rotation metadata.
 *
 * **API change:** constructor rejects duplicate key versions and missing
 * `currentVersion`. `decrypt` validates algorithm/IV/tag/ciphertext encodings
 * and lengths, mapping authentication failures to a safe {@link DomainException}
 * that does not leak key versions or provider error details.
 */
@Injectable()
export class EncryptionService {
  private readonly keys: ReadonlyMap<string, Buffer>;

  public constructor(
    keys: readonly EncryptionKey[],
    private readonly currentVersion: string,
  ) {
    const map = new Map<string, Buffer>();
    for (const { version, key } of keys) {
      if (map.has(version)) {
        throw new DomainException(
          'Duplicate encryption key version',
          'ENCRYPTION_INVALID_CONFIG',
        );
      }
      map.set(version, key);
    }
    if (!map.has(currentVersion)) {
      throw new DomainException(
        'Current encryption key version is not configured',
        'ENCRYPTION_INVALID_CONFIG',
      );
    }
    this.keys = map;
  }

  public encrypt(value: string): EncryptedValue {
    const key = this.requireKey(this.currentVersion);
    if (key.length !== AES_KEY_BYTES) {
      throw new DomainException(
        'AES key must be 32 bytes',
        'ENCRYPTION_INVALID_CONFIG',
      );
    }
    const iv = randomBytes(GCM_IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return {
      algorithm: ALGORITHM,
      keyVersion: this.currentVersion,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  public decrypt(value: EncryptedValue): string {
    this.assertEncryptedValue(value);
    try {
      const key = this.requireKey(value.keyVersion);
      const iv = this.decodeExactBase64(value.iv, GCM_IV_BYTES);
      const authTag = this.decodeExactBase64(value.authTag, GCM_AUTH_TAG_BYTES);
      const ciphertext = this.decodeBase64(value.ciphertext);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch (error: unknown) {
      if (error instanceof DomainException) {
        throw error;
      }
      throw new DomainException('Decryption failed', 'ENCRYPTION_AUTH_FAILED');
    }
  }

  public rsaEncrypt(value: string, publicKey: string): string {
    return publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(value),
    ).toString('base64');
  }

  public rsaDecrypt(value: string, privateKey: string): string {
    return privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(value, 'base64'),
    ).toString('utf8');
  }

  private requireKey(version: string): Buffer {
    const key = this.keys.get(version);
    if (!key) {
      throw new DomainException('Decryption failed', 'ENCRYPTION_AUTH_FAILED');
    }
    return key;
  }

  private assertEncryptedValue(value: EncryptedValue): void {
    if (value.algorithm !== ALGORITHM) {
      throw new DomainException(
        'Unsupported encryption algorithm',
        'ENCRYPTION_INVALID_VALUE',
      );
    }
    if (typeof value.keyVersion !== 'string' || value.keyVersion.length === 0) {
      throw new DomainException(
        'Invalid encrypted value',
        'ENCRYPTION_INVALID_VALUE',
      );
    }
  }

  private decodeExactBase64(value: string, expectedBytes: number): Buffer {
    const buffer = this.decodeBase64(value);
    if (buffer.length !== expectedBytes) {
      throw new DomainException(
        'Invalid encrypted value',
        'ENCRYPTION_INVALID_VALUE',
      );
    }
    return buffer;
  }

  private decodeBase64(value: string): Buffer {
    if (typeof value !== 'string' || value.length % 4 !== 0) {
      throw new DomainException(
        'Invalid encrypted value',
        'ENCRYPTION_INVALID_VALUE',
      );
    }
    if (value.length > 0 && !BASE64_PATTERN.test(value)) {
      throw new DomainException(
        'Invalid encrypted value',
        'ENCRYPTION_INVALID_VALUE',
      );
    }
    const buffer = Buffer.from(value, 'base64');
    if (buffer.toString('base64') !== value) {
      throw new DomainException(
        'Invalid encrypted value',
        'ENCRYPTION_INVALID_VALUE',
      );
    }
    return buffer;
  }
}
