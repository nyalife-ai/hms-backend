import {
  type IdempotencyRecord,
  type IdempotencyReserveResult,
} from './idempotency.types';

/**
 * Atomic idempotency store contract.
 *
 * Multi-instance deployments share one store implementation (e.g. Redis).
 * Reservation is atomic: only one owner may execute for a given key+fingerprint.
 */
export interface IdempotencyStore {
  /**
   * Atomically reserve an in-progress key with fingerprint and ownership token.
   * Expired or released keys may be re-reserved. Conflicting fingerprints throw
   * from the service layer after inspecting the returned existing record.
   */
  tryReserve(
    key: string,
    fingerprint: string,
    ownerToken: string,
    ttlMilliseconds: number,
  ): Promise<IdempotencyReserveResult>;

  /** Mark a reserved key completed with the response payload. */
  complete<T>(
    key: string,
    ownerToken: string,
    response: T,
    ttlMilliseconds: number,
  ): Promise<void>;

  /**
   * Release a reservation after owner failure so another attempt may proceed.
   * No-op when the owner token does not match.
   */
  release(key: string, ownerToken: string): Promise<void>;

  get<T>(key: string): Promise<IdempotencyRecord<T> | undefined>;

  /**
   * Wait until an in-progress record completes, is released, or `timeoutMs` elapses.
   */
  waitForCompletion<T>(
    key: string,
    timeoutMs: number,
  ): Promise<IdempotencyRecord<T> | undefined>;
}
