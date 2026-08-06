import { CacheStore } from '../contracts/cache.interface';

export class TagIndex {
  private readonly index = new Map<string, Set<string>>();

  public constructor(private readonly backingStore?: CacheStore) {}

  public async add(key: string, tags: readonly string[]): Promise<void> {
    await Promise.all(
      tags.map(async (tag) => {
        const keys = new Set(await this.keysForTag(tag));
        keys.add(key);
        this.index.set(tag, keys);
        await this.persist(tag, keys);
      }),
    );
  }

  public async keysForTag(tag: string): Promise<readonly string[]> {
    const memoryKeys = this.index.get(tag);
    if (memoryKeys) {
      return [...memoryKeys];
    }
    const storedKeys = await this.backingStore?.get<string[]>(
      this.storeKey(tag),
    );
    const keys = new Set(storedKeys ?? []);
    if (keys.size > 0) {
      this.index.set(tag, keys);
    }
    return [...keys];
  }

  public async removeKey(key: string): Promise<void> {
    await Promise.all(
      [...this.index.entries()].map(async ([tag, keys]) => {
        if (keys.delete(key)) {
          await this.persist(tag, keys);
        }
      }),
    );
  }

  public async clearTag(tag: string): Promise<void> {
    this.index.delete(tag);
    await this.backingStore?.del(this.storeKey(tag));
  }

  public async clear(): Promise<void> {
    const tags = [...this.index.keys()];
    this.index.clear();
    await Promise.all(
      tags.map(async (tag) => {
        await this.backingStore?.del(this.storeKey(tag));
      }),
    );
  }

  private async persist(tag: string, keys: Set<string>): Promise<void> {
    if (!this.backingStore) {
      return;
    }
    if (keys.size === 0) {
      await this.backingStore.del(this.storeKey(tag));
      return;
    }
    await this.backingStore.set(this.storeKey(tag), [...keys]);
  }

  private storeKey(tag: string): string {
    return `__tags__:${tag}`;
  }
}
