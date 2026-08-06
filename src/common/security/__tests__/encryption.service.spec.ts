import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../encryption.service';

/**
 * Unit Tests for EncryptionService
 *
 * Verifies versioned AES-256-GCM encryption, decryption, and payload parsing,
 * including edge cases like key derivation, tampering, and invalid inputs.
 */
describe('EncryptionService', () => {
  let service: EncryptionService;

  /**
   * Helper to mock the ConfigService with a specific key.
   */
  const mockConfigService = (key: string | undefined) => ({
    get: jest.fn((name: string) => {
      if (name === 'ENCRYPTION_SECRET_KEY' || name === 'encryption.secretKey') {
        return key;
      }
      return undefined;
    }),
  });

  describe('Initialization', () => {
    it('should initialize successfully with a valid 32-character key', async () => {
      const validKey = 'abcdefghijklmnopqrstuvwxyz123456'; // Exactly 32 chars
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          { provide: ConfigService, useValue: mockConfigService(validKey) },
        ],
      }).compile();

      service = module.get<EncryptionService>(EncryptionService);
      expect(service).toBeDefined();
    });

    it('should initialize and derive key via scrypt if key is not 32 characters', async () => {
      const shortKey = 'shortkey'; // Less than 32 chars
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          { provide: ConfigService, useValue: mockConfigService(shortKey) },
        ],
      }).compile();

      service = module.get<EncryptionService>(EncryptionService);
      expect(service).toBeDefined();
    });

    it('should throw InternalServerErrorException if no key is provided', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            EncryptionService,
            { provide: ConfigService, useValue: mockConfigService(undefined) },
          ],
        }).compile(),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('with valid key', () => {
    const VALID_KEY = 'abcdefghijklmnopqrstuvwxyz123456';

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          { provide: ConfigService, useValue: mockConfigService(VALID_KEY) },
        ],
      }).compile();
      service = module.get<EncryptionService>(EncryptionService);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('encryptPayload()', () => {
      it('should return a versioned base64url payload', () => {
        const result = service.encryptPayload('{"mid":1}');
        expect(typeof result).toBe('string');
        expect(result.startsWith('v1.')).toBe(true);
        const parts = result.split('.');
        expect(parts).toHaveLength(4);
        expect(parts[0]).toBe('v1');
        for (const part of parts.slice(1)) {
          expect(/^[A-Za-z0-9_-]+$/.test(part)).toBe(true);
        }
      });

      it('should produce different ciphertext each call due to random IV', () => {
        const a = service.encryptPayload('{"mid":1}');
        const b = service.encryptPayload('{"mid":1}');
        expect(a).not.toBe(b);
      });

      it('should not contain the original plaintext in the result', () => {
        const plaintext = '{"mid":1,"secret":"yes"}';
        const encrypted = service.encryptPayload(plaintext);
        expect(encrypted).not.toContain('secret');
        expect(encrypted).not.toContain('mid');
      });
    });

    describe('decryptPayload()', () => {
      it('should round-trip correctly: encrypt → decrypt returns original', () => {
        const original = JSON.stringify({
          mid: 1,
          uid: 2,
          issuedAt: new Date().toISOString(),
        });
        const encrypted = service.encryptPayload(original);
        const decrypted = service.decryptPayload(encrypted);
        expect(decrypted).toBe(original);
      });

      it('should throw BadRequestException for empty token', () => {
        expect(() => service.decryptPayload('')).toThrow(BadRequestException);
      });

      it('should throw BadRequestException for non-string input', () => {
        expect(() => service.decryptPayload(null as any)).toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException for random garbage input', () => {
        expect(() =>
          service.decryptPayload('not-valid-aes-ciphertext!!'),
        ).toThrow(BadRequestException);
      });

      it('should throw BadRequestException for truncated payload', () => {
        const encrypted = service.encryptPayload('hello');
        const truncated = encrypted.slice(0, encrypted.length - 4);
        expect(() => service.decryptPayload(truncated)).toThrow(
          BadRequestException,
        );
        expect(() => service.decryptPayload('v1.only.two')).toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException for unknown version marker', () => {
        const encrypted = service.encryptPayload('hello');
        const unknownVersion = encrypted.replace(/^v1\./, 'v99.');
        expect(() => service.decryptPayload(unknownVersion)).toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException for tampered ciphertext', () => {
        const encrypted = service.encryptPayload('hello');
        const parts = encrypted.split('.');
        // Flip a character in the ciphertext segment
        const ct = parts[3];
        const flipped = ct[0] === 'A' ? 'B' + ct.slice(1) : 'A' + ct.slice(1);
        const tampered = [parts[0], parts[1], parts[2], flipped].join('.');
        expect(() => service.decryptPayload(tampered)).toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException for tampered auth tag', () => {
        const encrypted = service.encryptPayload('hello');
        const parts = encrypted.split('.');
        const tag = parts[2];
        const flipped =
          tag[0] === 'A' ? 'B' + tag.slice(1) : 'A' + tag.slice(1);
        const tampered = [parts[0], parts[1], flipped, parts[3]].join('.');
        expect(() => service.decryptPayload(tampered)).toThrow(
          BadRequestException,
        );
      });

      it('should ensure error messages do not leak the secret key', () => {
        try {
          service.decryptPayload('garbage');
        } catch (e: any) {
          expect(e.message).not.toContain(VALID_KEY);
          expect(e.message).toBe('Invalid or corrupted encrypted token');
        }
      });
    });

    describe('parsePayload()', () => {
      it('should decrypt and parse a valid encrypted JSON string', () => {
        const originalObj = { mid: 1, uid: 2 };
        const encrypted = service.encryptPayload(JSON.stringify(originalObj));

        const result = service.parsePayload(encrypted);
        expect(result).toEqual(originalObj);
      });

      it('should throw BadRequestException for malformed JSON after decryption', () => {
        const encryptedInvalidJson = service.encryptPayload('{invalid json');

        expect(() => service.parsePayload(encryptedInvalidJson)).toThrow(
          BadRequestException,
        );
      });

      it('should throw BadRequestException if decryption fails before parsing', () => {
        expect(() => service.parsePayload('not-a-valid-payload')).toThrow(
          BadRequestException,
        );
      });
    });
  });
});
