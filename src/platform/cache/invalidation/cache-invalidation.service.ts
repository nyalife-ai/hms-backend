import { Inject, Injectable } from '@nestjs/common';
import { CACHE_STORE, CACHE_TAG_INDEX } from '../contracts/cache.tokens';
import type { CacheStore } from '../contracts/cache.interface';
import { TagIndex } from '../strategies/tag-index';

@Injectable()
export class CacheInvalidationService {
  public constructor(
    @Inject(CACHE_STORE) private readonly store: CacheStore,
    @Inject(CACHE_TAG_INDEX) private readonly tagIndex: TagIndex,
  ) {}

  public async invalidateByKey(key: string): Promise<boolean> {
    const deleted = await this.store.del(key);
    await this.tagIndex.removeKey(key);
    return deleted;
  }

  public async invalidateByTag(tag: string): Promise<number> {
    const keys = await this.tagIndex.keysForTag(tag);
    const results = await Promise.all(
      keys.map(async (key) => this.store.del(key)),
    );
    await this.tagIndex.clearTag(tag);
    return results.filter(Boolean).length;
  }

  public async invalidateNamespace(): Promise<void> {
    await this.store.clear();
    await this.tagIndex.clear();
  }
}
