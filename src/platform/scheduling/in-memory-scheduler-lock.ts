import { Injectable } from '@nestjs/common';
import { assertPositiveInteger } from '../architecture/production-defaults';
import { generateId } from '../../core';
import { SchedulerLock } from './contracts';

interface LockEntry {
  readonly token: string;
  readonly expiresAt: number;
}

export type SchedulerLockClock = () => number;
export type SchedulerTokenFactory = () => string;

export interface InMemorySchedulerLockOptions {
  /** Maximum concurrent lock keys. Defaults to 10_000. */
  readonly maxEntries?: number;
}

@Injectable()
export class InMemorySchedulerLock implements SchedulerLock {
  private readonly locks = new Map<string, LockEntry>();
  private readonly maxEntries: number;

  public constructor(
    private readonly clock: SchedulerLockClock = Date.now,
    private readonly tokenFactory: SchedulerTokenFactory = () =>
      generateId('scheduler-lock'),
    options: InMemorySchedulerLockOptions = {},
  ) {
    this.maxEntries = assertPositiveInteger(
      options.maxEntries ?? 10_000,
      'InMemorySchedulerLock maxEntries',
    );
  }

  public acquire(key: string, ttlMs: number): Promise<string | undefined> {
    if (key.trim().length === 0) {
      return Promise.reject(new TypeError('Lock key cannot be empty'));
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      return Promise.reject(
        new RangeError('Lock TTL must be a positive finite number'),
      );
    }
    this.purgeExpired();
    const existing = this.locks.get(key);
    if (existing && existing.expiresAt > this.clock()) {
      return Promise.resolve(undefined);
    }
    if (!existing && this.locks.size >= this.maxEntries) {
      return Promise.reject(
        new RangeError(
          `InMemorySchedulerLock is full (maxEntries=${this.maxEntries})`,
        ),
      );
    }
    const token = this.tokenFactory();
    this.locks.set(key, { token, expiresAt: this.clock() + ttlMs });
    return Promise.resolve(token);
  }

  public release(key: string, token: string): Promise<boolean> {
    const existing = this.locks.get(key);
    if (!existing || existing.token !== token) {
      return Promise.resolve(false);
    }
    this.locks.delete(key);
    return Promise.resolve(true);
  }

  public renew(key: string, token: string, ttlMs: number): Promise<boolean> {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      return Promise.reject(
        new RangeError('Lock TTL must be a positive finite number'),
      );
    }
    const existing = this.locks.get(key);
    if (!existing || existing.token !== token) {
      return Promise.resolve(false);
    }
    if (existing.expiresAt <= this.clock()) {
      this.locks.delete(key);
      return Promise.resolve(false);
    }
    this.locks.set(key, { token, expiresAt: this.clock() + ttlMs });
    return Promise.resolve(true);
  }

  private purgeExpired(): void {
    const now = this.clock();
    for (const [key, entry] of this.locks) {
      if (entry.expiresAt <= now) {
        this.locks.delete(key);
      }
    }
  }
}
