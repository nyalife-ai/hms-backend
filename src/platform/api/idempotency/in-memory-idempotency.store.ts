import { type IdempotencyStore } from './idempotency-store.interface';
import {
  type IdempotencyRecord,
  type IdempotencyReserveResult,
} from './idempotency.types';

export interface InMemoryIdempotencyStoreOptions {
  /** Maximum retained records (expired entries are evicted first). */
  readonly maxEntries?: number;
  readonly now?: () => number;
  /** Poll interval used by {@link waitForCompletion}. */
  readonly pollIntervalMs?: number;
}

type MutableRecord = {
  fingerprint: string;
  ownerToken: string;
  state: 'in_progress' | 'completed';
  expiresAt: number;
  response?: unknown;
};

/**
 * Bounded process-local store for tests and non-production use.
 * Not safe as the sole store across multiple service instances.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, MutableRecord>();
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly waiters = new Map<string, Set<() => void>>();

  public constructor(options: InMemoryIdempotencyStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
    this.now = options.now ?? Date.now;
    this.pollIntervalMs = options.pollIntervalMs ?? 5;
    if (!Number.isFinite(this.maxEntries) || this.maxEntries <= 0) {
      throw new RangeError('Idempotency store maxEntries must be positive');
    }
    if (!Number.isFinite(this.pollIntervalMs) || this.pollIntervalMs <= 0) {
      throw new RangeError('Idempotency store pollIntervalMs must be positive');
    }
  }

  public tryReserve(
    key: string,
    fingerprint: string,
    ownerToken: string,
    ttlMilliseconds: number,
  ): Promise<IdempotencyReserveResult> {
    this.evictExpired();
    const existing = this.records.get(key);
    if (existing !== undefined && existing.expiresAt > this.now()) {
      return Promise.resolve({
        kind: 'existing',
        record: this.snapshot(existing),
      });
    }
    this.ensureCapacity();
    const record: MutableRecord = {
      fingerprint,
      ownerToken,
      state: 'in_progress',
      expiresAt: this.now() + ttlMilliseconds,
    };
    this.records.set(key, record);
    return Promise.resolve({ kind: 'reserved', ownerToken });
  }

  public complete<T>(
    key: string,
    ownerToken: string,
    response: T,
    ttlMilliseconds: number,
  ): Promise<void> {
    const existing = this.records.get(key);
    if (
      existing === undefined ||
      existing.ownerToken !== ownerToken ||
      existing.state !== 'in_progress'
    ) {
      return Promise.resolve();
    }
    existing.state = 'completed';
    existing.response = response;
    existing.expiresAt = this.now() + ttlMilliseconds;
    this.notify(key);
    return Promise.resolve();
  }

  public release(key: string, ownerToken: string): Promise<void> {
    const existing = this.records.get(key);
    if (
      existing !== undefined &&
      existing.ownerToken === ownerToken &&
      existing.state === 'in_progress'
    ) {
      this.records.delete(key);
      this.notify(key);
    }
    return Promise.resolve();
  }

  public get<T>(key: string): Promise<IdempotencyRecord<T> | undefined> {
    this.evictExpired();
    const existing = this.records.get(key);
    if (existing === undefined || existing.expiresAt <= this.now()) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(this.snapshot(existing) as IdempotencyRecord<T>);
  }

  public async waitForCompletion<T>(
    key: string,
    timeoutMs: number,
  ): Promise<IdempotencyRecord<T> | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const current = await this.get<T>(key);
      if (current === undefined || current.state === 'completed') {
        return current;
      }
      const remaining = deadline - Date.now();
      await this.waitUntilChange(
        key,
        Math.min(this.pollIntervalMs, Math.max(0, remaining)),
      );
      if (remaining <= 0) {
        return current;
      }
    }
  }

  /** Test helper: current retained entry count (including in-progress). */
  public size(): number {
    this.evictExpired();
    return this.records.size;
  }

  private snapshot(record: MutableRecord): IdempotencyRecord {
    return {
      fingerprint: record.fingerprint,
      ownerToken: record.ownerToken,
      state: record.state,
      expiresAt: record.expiresAt,
      ...(record.response !== undefined ? { response: record.response } : {}),
    };
  }

  private evictExpired(): void {
    const now = this.now();
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
        this.notify(key);
      }
    }
  }

  private ensureCapacity(): void {
    if (this.records.size < this.maxEntries) {
      return;
    }
    const oldest = this.records.keys().next().value!;
    this.records.delete(oldest);
    this.notify(oldest);
  }

  private notify(key: string): void {
    const waiters = this.waiters.get(key);
    if (waiters === undefined) {
      return;
    }
    this.waiters.delete(key);
    for (const wake of waiters) {
      wake();
    }
  }

  private waitUntilChange(key: string, timeoutMs: number): Promise<void> {
    if (timeoutMs <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        const set = this.waiters.get(key);
        if (set !== undefined) {
          set.delete(finish);
          if (set.size === 0) {
            this.waiters.delete(key);
          }
        }
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      timer.unref();
      let set = this.waiters.get(key);
      if (set === undefined) {
        set = new Set();
        this.waiters.set(key, set);
      }
      set.add(finish);
    });
  }
}
