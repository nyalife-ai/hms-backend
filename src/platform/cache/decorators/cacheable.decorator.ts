import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const CACHEABLE_METADATA = 'platform:cacheable';

export type CacheKeyResolver = string | ((...args: unknown[]) => string);
export type CacheTagsResolver =
  readonly string[] | ((...args: unknown[]) => readonly string[]);

export interface CacheableOptions {
  /** Time to live in seconds. */
  readonly ttl?: number;
  readonly key?: CacheKeyResolver;
  readonly tags?: CacheTagsResolver;
}

export function Cacheable(options: CacheableOptions = {}): CustomDecorator {
  return SetMetadata(CACHEABLE_METADATA, options);
}
