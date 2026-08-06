import type {
  StorageObjectMetadata,
  StorageProvider,
} from './storage-provider.interface';

/**
 * Default `copy`/`move` implementations for any {@link StorageProvider},
 * built purely from `get` + `put` + `delete`. Infrastructure adapters that
 * cannot copy server-side (or tests using minimal doubles) can delegate to
 * this helper instead of re-implementing the read/write/cleanup dance.
 */
export class StorageOperations {
  public constructor(private readonly provider: StorageProvider) {}

  public async copy(from: string, to: string): Promise<StorageObjectMetadata> {
    const body = await this.provider.get(from);
    const source = await this.provider.stat(from);
    return this.provider.put(to, body, {
      ...(source.contentType === undefined
        ? {}
        : { contentType: source.contentType }),
    });
  }

  public async move(from: string, to: string): Promise<StorageObjectMetadata> {
    const metadata = await this.copy(from, to);
    await this.provider.delete(from);
    return metadata;
  }
}
