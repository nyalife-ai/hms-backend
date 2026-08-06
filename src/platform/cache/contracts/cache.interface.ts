export interface CacheSetOptions {
  /** Time to live in seconds. */
  readonly ttl?: number;
  /** Explicit alias for ttl. */
  readonly ttlSeconds?: number;
  readonly tags?: readonly string[];
}

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  del(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}
