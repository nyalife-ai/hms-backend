import { CacheSetOptions, CacheStore } from '../contracts/cache.interface';

interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt?: number;
}

export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry>();

  public constructor(private readonly now: () => number = Date.now) {}

  public get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) {
      return Promise.resolve(undefined);
    }
    if (entry.expiresAt !== undefined && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value as T);
  }

  public set<T>(
    key: string,
    value: T,
    options: CacheSetOptions = {},
  ): Promise<void> {
    const ttlSeconds = options.ttlSeconds ?? options.ttl;
    if (
      ttlSeconds !== undefined &&
      (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0)
    ) {
      this.entries.delete(key);
      return Promise.resolve();
    }
    const expiresAt =
      ttlSeconds === undefined ? undefined : this.now() + ttlSeconds * 1_000;
    this.entries.set(key, { value, expiresAt });
    return Promise.resolve();
  }

  public del(key: string): Promise<boolean> {
    return Promise.resolve(this.entries.delete(key));
  }

  public async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  public clear(): Promise<void> {
    this.entries.clear();
    return Promise.resolve();
  }
}
