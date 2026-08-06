import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { CacheKeyResolver, CacheTagsResolver } from './cacheable.decorator';

export const CACHE_EVICT_METADATA = 'platform:cache-evict';

export interface CacheEvictOptions {
  readonly key?: CacheKeyResolver;
  readonly tags?: CacheTagsResolver;
  readonly namespace?: boolean;
  readonly beforeInvocation?: boolean;
}

export function CacheEvict(options: CacheEvictOptions = {}): CustomDecorator {
  return SetMetadata(CACHE_EVICT_METADATA, options);
}
