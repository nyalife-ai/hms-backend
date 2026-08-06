import { Injectable } from '@nestjs/common';
import { generateId } from '../../../core';
import { DistributedLock } from './distributed-lock.interface';

interface LockEntry {
  readonly token: string;
  readonly expiresAt: number;
}

export type LockClock = () => number;
export type LockTokenFactory = () => string;

@Injectable()
export class InMemoryDistributedLock implements DistributedLock {
  private readonly locks = new Map<string, LockEntry>();

  public constructor(
    private readonly clock: LockClock = Date.now,
    private readonly tokenFactory: LockTokenFactory = () =>
      generateId('reliability-lock'),
  ) {}

  public acquire(
    key: string,
    ttlMilliseconds: number,
  ): Promise<string | undefined> {
    this.validate(key, ttlMilliseconds);
    const now = this.clock();
    const existing = this.locks.get(key);
    if (existing && existing.expiresAt > now) {
      return Promise.resolve(undefined);
    }
    const token = this.tokenFactory();
    this.locks.set(key, { token, expiresAt: now + ttlMilliseconds });
    return Promise.resolve(token);
  }

  public release(key: string, token: string): Promise<boolean> {
    const existing = this.getActive(key);
    if (!existing || existing.token !== token) {
      return Promise.resolve(false);
    }
    this.locks.delete(key);
    return Promise.resolve(true);
  }

  public renew(
    key: string,
    token: string,
    ttlMilliseconds: number,
  ): Promise<boolean> {
    this.validate(key, ttlMilliseconds);
    const existing = this.getActive(key);
    if (!existing || existing.token !== token) {
      return Promise.resolve(false);
    }
    this.locks.set(key, {
      token,
      expiresAt: this.clock() + ttlMilliseconds,
    });
    return Promise.resolve(true);
  }

  private getActive(key: string): LockEntry | undefined {
    const existing = this.locks.get(key);
    if (existing && existing.expiresAt <= this.clock()) {
      this.locks.delete(key);
      return undefined;
    }
    return existing;
  }

  private validate(key: string, ttlMilliseconds: number): void {
    if (key.trim().length === 0) {
      throw new TypeError('Lock key cannot be empty');
    }
    if (!Number.isFinite(ttlMilliseconds) || ttlMilliseconds <= 0) {
      throw new RangeError('Lock TTL must be a positive finite number');
    }
  }
}
