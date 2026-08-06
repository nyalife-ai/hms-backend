import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Millisecond clock used for webhook timestamp signing and verification.
 * Inject in tests for deterministic replay-protection checks.
 */
export interface WebhookClock {
  now(): number;
}

export interface WebhookSignerOptions {
  /**
   * Maximum age of a signed webhook timestamp in milliseconds.
   * Signatures older than this are rejected as replay attempts.
   * @default 300_000 (5 minutes)
   */
  readonly maxAgeMs?: number;
  readonly clock?: WebhookClock;
}

export interface SignedWebhook {
  /** Versioned signature header value, e.g. `v1=<hex>`. */
  readonly signature: string;
  /** Unix epoch milliseconds used in the signed payload. */
  readonly timestamp: number;
}

const SIGNATURE_PREFIX = 'v1=';
const HEX_SHA256_LENGTH = 64;

/**
 * HMAC-SHA256 webhook signer with timestamped, versioned signatures.
 *
 * **API change:** `sign` now returns `{ signature, timestamp }` instead of a bare
 * hex digest. `verify` requires the companion timestamp and enforces replay
 * protection (max age + reject future/malformed timestamps). The signature
 * format is `v1=<hex>` over `${timestamp}.${payload}`.
 */
export class WebhookSigner {
  private readonly maxAgeMs: number;
  private readonly clock: WebhookClock;

  public constructor(options: WebhookSignerOptions = {}) {
    const maxAgeMs = options.maxAgeMs ?? 300_000;
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
      throw new Error('Webhook maxAgeMs must be a positive finite number');
    }
    this.maxAgeMs = maxAgeMs;
    this.clock = options.clock ?? { now: (): number => Date.now() };
  }

  public sign(
    payload: string,
    secret: string,
    timestamp?: number,
  ): SignedWebhook {
    if (!secret) {
      throw new Error('Webhook secret must not be empty');
    }
    const ts = timestamp ?? this.clock.now();
    if (!Number.isFinite(ts) || !Number.isInteger(ts)) {
      throw new Error('Webhook timestamp must be a finite integer');
    }
    const digest = createHmac('sha256', secret)
      .update(`${ts}.${payload}`)
      .digest('hex');
    return {
      signature: `${SIGNATURE_PREFIX}${digest}`,
      timestamp: ts,
    };
  }

  public verify(
    payload: string,
    signature: string,
    secret: string,
    timestamp: number | string,
  ): boolean {
    if (!signature || !secret) {
      return false;
    }
    const ts = this.parseTimestamp(timestamp);
    if (ts === null) {
      return false;
    }
    const now = this.clock.now();
    if (ts > now) {
      return false;
    }
    if (now - ts > this.maxAgeMs) {
      return false;
    }
    const expected = this.sign(payload, secret, ts).signature;
    return this.safeEqualSignatures(expected, signature);
  }

  private parseTimestamp(timestamp: number | string): number | null {
    if (typeof timestamp === 'number') {
      return Number.isFinite(timestamp) && Number.isInteger(timestamp)
        ? timestamp
        : null;
    }
    if (typeof timestamp !== 'string' || timestamp.trim() === '') {
      return null;
    }
    if (!/^-?\d+$/.test(timestamp)) {
      return null;
    }
    const parsed = Number(timestamp);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  private safeEqualSignatures(expected: string, supplied: string): boolean {
    if (
      !expected.startsWith(SIGNATURE_PREFIX) ||
      !supplied.startsWith(SIGNATURE_PREFIX)
    ) {
      return false;
    }
    const expectedHex = expected.slice(SIGNATURE_PREFIX.length);
    const suppliedHex = supplied.slice(SIGNATURE_PREFIX.length);
    if (
      expectedHex.length !== HEX_SHA256_LENGTH ||
      suppliedHex.length !== HEX_SHA256_LENGTH ||
      !/^[0-9a-f]+$/i.test(suppliedHex)
    ) {
      return false;
    }
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const suppliedBuf = Buffer.from(suppliedHex, 'hex');
    return (
      expectedBuf.length === suppliedBuf.length &&
      timingSafeEqual(expectedBuf, suppliedBuf)
    );
  }
}
