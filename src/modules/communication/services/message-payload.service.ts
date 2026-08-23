/**
 * Pack / unpack message bodies via EncryptionService.
 * Supports encrypted v1 payloads and legacy plaintext JSON.
 * Never logs message content.
 */

import { Injectable } from '@nestjs/common';
import { EncryptionService } from '../../../common/security/encryption.service';

export type MessagePayloadExtras = Record<string, unknown>;

export type UnpackedMessagePayload = {
  text: string;
  extras?: MessagePayloadExtras;
};

@Injectable()
export class MessagePayloadService {
  public constructor(private readonly encryption: EncryptionService) {}

  public pack(text: string, extras?: MessagePayloadExtras): string {
    const payload = JSON.stringify({
      text,
      ...(extras && Object.keys(extras).length ? { extras } : {}),
    });
    return this.encryption.encryptPayload(payload);
  }

  public unpack(encryptedPayload: string): UnpackedMessagePayload {
    if (!encryptedPayload) {
      return { text: '' };
    }

    // Prefer decrypt (v1.iv.tag.cipher format).
    if (encryptedPayload.startsWith('v1.')) {
      try {
        const plain = this.encryption.decryptPayload(encryptedPayload);
        return this.parseJsonPayload(plain);
      } catch {
        // Fall through to legacy JSON parse.
      }
    }

    try {
      return this.parseJsonPayload(encryptedPayload);
    } catch {
      return { text: encryptedPayload };
    }
  }

  private parseJsonPayload(raw: string): UnpackedMessagePayload {
    const parsed = JSON.parse(raw) as {
      text?: unknown;
      extras?: MessagePayloadExtras;
    };
    const text = typeof parsed?.text === 'string' ? parsed.text : '';
    return {
      text,
      ...(parsed?.extras ? { extras: parsed.extras } : {}),
    };
  }
}
