import { Injectable } from '@nestjs/common';
import { DomainException } from '../../../core';

export interface BruteForceFailureState {
  readonly count: number;
  readonly firstFailureAt: number;
  readonly lockedUntil?: number;
}

/**
 * Pluggable store for brute-force state. Use a distributed implementation
 * (Redis, etc.) in multi-instance deployments.
 */
export interface BruteForceStore {
  get(key: string): BruteForceFailureState | undefined;
  set(key: string, state: BruteForceFailureState): void;
  delete(key: string): void;
  readonly size: number;
  keys(): IterableIterator<string>;
}

export interface InMemoryBruteForceStoreOptions {
  /**
   * Maximum identities tracked after lockout/window cleanup.
   * @default 10_000
   */
  readonly maxEntries?: number;
}

/**
 * Bounded in-memory {@link BruteForceStore} with lazy cleanup of expired entries.
 */
export class InMemoryBruteForceStore implements BruteForceStore {
  private readonly states = new Map<string, BruteForceFailureState>();
  private readonly maxEntries: number;

  public constructor(options: InMemoryBruteForceStoreOptions = {}) {
    const maxEntries = options.maxEntries ?? 10_000;
    if (
      !Number.isFinite(maxEntries) ||
      maxEntries <= 0 ||
      !Number.isInteger(maxEntries)
    ) {
      throw new DomainException(
        'Brute-force maxEntries must be a positive integer',
        'BRUTE_FORCE_INVALID_CONFIG',
      );
    }
    this.maxEntries = maxEntries;
  }

  public get(key: string): BruteForceFailureState | undefined {
    return this.states.get(key);
  }

  public set(key: string, state: BruteForceFailureState): void {
    if (!this.states.has(key) && this.states.size >= this.maxEntries) {
      throw new DomainException(
        'Brute-force store capacity exhausted',
        'BRUTE_FORCE_STORE_FULL',
      );
    }
    this.states.set(key, state);
  }

  public delete(key: string): void {
    this.states.delete(key);
  }

  public get size(): number {
    return this.states.size;
  }

  public keys(): IterableIterator<string> {
    return this.states.keys();
  }

  public cleanup(now: number, windowMs: number): void {
    for (const [key, state] of this.states) {
      const windowExpired = now - state.firstFailureAt >= windowMs;
      const unlocked =
        state.lockedUntil === undefined || state.lockedUntil <= now;
      if (windowExpired && unlocked) {
        this.states.delete(key);
      }
    }
  }
}

export interface BruteForceProtectorOptions {
  readonly maxFailures?: number;
  readonly windowMs?: number;
  readonly lockoutMs?: number;
  readonly maxEntries?: number;
  /**
   * Inject a distributed store for multi-instance deployments.
   * Defaults to a bounded {@link InMemoryBruteForceStore}.
   */
  readonly store?: BruteForceStore;
}

/**
 * Tracks authentication failures and enforces temporary lockouts.
 *
 * **API change:** constructor accepts {@link BruteForceProtectorOptions} (or the
 * legacy positional `(maxFailures, windowMs, lockoutMs)` form). State is bounded
 * and cleaned up; inject {@link BruteForceStore} for distributed deployments.
 * The default store is explicitly in-memory — do not rely on it across instances.
 */
@Injectable()
export class BruteForceProtector {
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;
  private readonly store: BruteForceStore;
  private readonly ownsInMemoryStore: boolean;
  private readonly inMemoryStore: InMemoryBruteForceStore | undefined;

  public constructor(
    maxFailuresOrOptions: number | BruteForceProtectorOptions = 5,
    windowMs = 15 * 60_000,
    lockoutMs = 15 * 60_000,
  ) {
    const options: BruteForceProtectorOptions =
      typeof maxFailuresOrOptions === 'object' && maxFailuresOrOptions !== null
        ? maxFailuresOrOptions
        : {
            maxFailures: maxFailuresOrOptions,
            windowMs,
            lockoutMs,
          };

    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 15 * 60_000;
    this.lockoutMs = options.lockoutMs ?? 15 * 60_000;
    this.assertPositiveInteger('maxFailures', this.maxFailures);
    this.assertPositiveInteger('windowMs', this.windowMs);
    this.assertPositiveInteger('lockoutMs', this.lockoutMs);

    if (options.store) {
      this.store = options.store;
      this.ownsInMemoryStore = false;
      this.inMemoryStore = undefined;
    } else {
      this.inMemoryStore = new InMemoryBruteForceStore({
        maxEntries: options.maxEntries,
      });
      this.store = this.inMemoryStore;
      this.ownsInMemoryStore = true;
    }
  }

  public assertAllowed(key: string, now = Date.now()): void {
    this.cleanup(now);
    const state = this.store.get(key);
    if (state?.lockedUntil && state.lockedUntil > now) {
      throw new DomainException(
        'Authentication temporarily locked',
        'AUTH_LOCKED',
      );
    }
  }

  public recordFailure(key: string, now = Date.now()): void {
    this.cleanup(now);
    const existing = this.store.get(key);
    const base =
      !existing || now - existing.firstFailureAt >= this.windowMs
        ? { count: 0, firstFailureAt: now }
        : {
            count: existing.count,
            firstFailureAt: existing.firstFailureAt,
            lockedUntil: existing.lockedUntil,
          };
    const count = base.count + 1;
    const next: BruteForceFailureState = {
      count,
      firstFailureAt: base.firstFailureAt,
      ...(count >= this.maxFailures
        ? { lockedUntil: now + this.lockoutMs }
        : base.lockedUntil && base.lockedUntil > now
          ? { lockedUntil: base.lockedUntil }
          : {}),
    };
    this.store.set(key, next);
  }

  public recordSuccess(key: string): void {
    this.store.delete(key);
  }

  /** Visible for tests — entry count when using the default in-memory store. */
  public size(): number {
    return this.store.size;
  }

  private cleanup(now: number): void {
    if (this.ownsInMemoryStore && this.inMemoryStore) {
      this.inMemoryStore.cleanup(now, this.windowMs);
      return;
    }
    // Generic stores: drop keys whose lockout and failure window have both elapsed.
    for (const key of [...this.store.keys()]) {
      const state = this.store.get(key);
      if (!state) continue;
      const windowExpired = now - state.firstFailureAt >= this.windowMs;
      const unlocked =
        state.lockedUntil === undefined || state.lockedUntil <= now;
      if (windowExpired && unlocked) {
        this.store.delete(key);
      }
    }
  }

  private assertPositiveInteger(name: string, value: number): void {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      throw new DomainException(
        `Brute-force ${name} must be a positive integer`,
        'BRUTE_FORCE_INVALID_CONFIG',
      );
    }
  }
}

/**
 * Explicit alias underscoring that the default protector uses process-local memory.
 * Prefer injecting a distributed {@link BruteForceStore} in production clusters.
 */
export class InMemoryBruteForceProtector extends BruteForceProtector {}
