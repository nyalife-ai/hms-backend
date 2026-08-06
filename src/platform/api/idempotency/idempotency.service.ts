import { createHash, randomUUID } from 'node:crypto';
import { type IdempotencyStore } from './idempotency-store.interface';
import {
  type IdempotencyExecution,
  type IdempotencyRequest,
} from './idempotency.types';

export class IdempotencyConflictError extends Error {
  public constructor() {
    super('Idempotency key was reused for a different request');
    this.name = 'IdempotencyConflictError';
  }
}

export class IdempotencyService {
  public constructor(
    private readonly store: IdempotencyStore,
    private readonly ttlMilliseconds = 86_400_000,
    private readonly now: () => number = Date.now,
    private readonly createOwnerToken: () => string = randomUUID,
    private readonly waitTimeoutMilliseconds = 30_000,
  ) {
    if (!Number.isFinite(ttlMilliseconds) || ttlMilliseconds <= 0) {
      throw new RangeError('Idempotency TTL must be positive');
    }
    if (
      !Number.isFinite(waitTimeoutMilliseconds) ||
      waitTimeoutMilliseconds <= 0
    ) {
      throw new RangeError('Idempotency wait timeout must be positive');
    }
  }

  public fingerprint(request: IdempotencyRequest): string {
    return createHash('sha256')
      .update(
        [
          request.tenantId ?? '',
          request.principalId ?? '',
          request.method.toUpperCase(),
          request.path,
          this.stable(request.body),
        ].join('\n'),
      )
      .digest('hex');
  }

  /**
   * Builds a storage key scoped by tenant and principal to prevent
   * cross-tenant / cross-principal collisions on the same client key.
   */
  public scopedKey(key: string, request: IdempotencyRequest): string {
    const tenant = request.tenantId?.trim() || '_';
    const principal = request.principalId?.trim() || '_';
    return `t:${tenant}|p:${principal}|k:${key}`;
  }

  public async execute<T>(
    key: string,
    request: IdempotencyRequest,
    operation: () => Promise<T>,
  ): Promise<IdempotencyExecution<T>> {
    if (key.trim() === '') throw new Error('Idempotency key is required');
    const fingerprint = this.fingerprint(request);
    const storageKey = this.scopedKey(key, request);
    const ownerToken = this.createOwnerToken();
    const reservation = await this.store.tryReserve(
      storageKey,
      fingerprint,
      ownerToken,
      this.ttlMilliseconds,
    );

    if (reservation.kind === 'existing') {
      return this.handleExisting<T>(
        storageKey,
        fingerprint,
        reservation.record,
      );
    }

    try {
      const response = await operation();
      await this.store.complete(
        storageKey,
        ownerToken,
        response,
        this.ttlMilliseconds,
      );
      return { response, replayed: false };
    } catch (error: unknown) {
      await this.store.release(storageKey, ownerToken);
      throw error;
    }
  }

  private async handleExisting<T>(
    storageKey: string,
    fingerprint: string,
    record: {
      readonly fingerprint: string;
      readonly state: 'in_progress' | 'completed';
      readonly response?: unknown;
    },
  ): Promise<IdempotencyExecution<T>> {
    if (record.fingerprint !== fingerprint) {
      throw new IdempotencyConflictError();
    }
    if (record.state === 'completed') {
      return { response: record.response as T, replayed: true };
    }
    const completed = await this.store.waitForCompletion<T>(
      storageKey,
      this.waitTimeoutMilliseconds,
    );
    if (completed === undefined) {
      throw new Error('Idempotency reservation was released before completion');
    }
    if (completed.fingerprint !== fingerprint) {
      throw new IdempotencyConflictError();
    }
    if (completed.state !== 'completed') {
      throw new Error(
        'Idempotency wait timed out while request was in progress',
      );
    }
    return { response: completed.response as T, replayed: true };
  }

  private stable(value: unknown): string {
    if (value === undefined) return '';
    if (value === null || typeof value !== 'object')
      return JSON.stringify(value);
    if (Array.isArray(value))
      return `[${value.map((item) => this.stable(item)).join(',')}]`;
    const object = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${this.stable(object[key])}`)
      .join(',')}}`;
  }
}
