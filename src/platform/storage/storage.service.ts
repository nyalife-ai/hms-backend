import { buildCdnUrl, type CdnUrlOptions } from './cdn-url.helper';
import { isExtendedStorageProvider } from './extended-storage-provider.interface';
import { StorageOperations } from './storage-operations';
import type {
  SignedUrlOptions,
  StorageObjectMetadata,
  StoragePutOptions,
  StorageProvider,
} from './storage-provider.interface';
import {
  assertAllowedContentType,
  assertChecksumMatches,
  assertSafeKey,
  assertWithinSizeLimit,
} from './storage-security';

export interface StorageServiceOptions {
  readonly maxBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export interface UploadOptions extends StoragePutOptions {
  /** When provided, the uploaded object is verified against this checksum and rolled back on mismatch. */
  readonly expectedChecksum?: string;
}

/**
 * Facade over a {@link StorageProvider} that centralizes validation
 * (safe keys, size limits, allowed content types, checksum verification)
 * and exposes `copy`/`move` regardless of whether the underlying provider
 * implements {@link ExtendedStorageProvider} natively.
 */
export class StorageService {
  private readonly operations: StorageOperations;
  private readonly maxBytes: number;
  private readonly allowedContentTypes: readonly string[];

  public constructor(
    private readonly provider: StorageProvider,
    options: StorageServiceOptions = {},
  ) {
    this.operations = new StorageOperations(provider);
    this.maxBytes = options.maxBytes ?? Number.MAX_SAFE_INTEGER;
    this.allowedContentTypes = options.allowedContentTypes ?? [];
  }

  public async upload(
    key: string,
    body: Buffer,
    options: UploadOptions = {},
  ): Promise<StorageObjectMetadata> {
    assertSafeKey(key);
    assertWithinSizeLimit(body.byteLength, this.maxBytes);
    assertAllowedContentType(options.contentType, this.allowedContentTypes);
    const metadata = await this.provider.put(key, body, {
      ...(options.contentType === undefined
        ? {}
        : { contentType: options.contentType }),
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    });
    try {
      assertChecksumMatches(body, options.expectedChecksum);
    } catch (error: unknown) {
      await this.provider.delete(key).catch(() => undefined);
      throw error;
    }
    return metadata;
  }

  public download(key: string): Promise<Buffer> {
    return this.provider.get(key);
  }

  public getMetadata(key: string): Promise<StorageObjectMetadata> {
    return this.provider.stat(key);
  }

  public exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }

  public remove(key: string): Promise<boolean> {
    return this.provider.delete(key);
  }

  public signedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    return this.provider.signedUrl(key, options);
  }

  public copy(from: string, to: string): Promise<StorageObjectMetadata> {
    return isExtendedStorageProvider(this.provider)
      ? this.provider.copy(from, to)
      : this.operations.copy(from, to);
  }

  public move(from: string, to: string): Promise<StorageObjectMetadata> {
    return isExtendedStorageProvider(this.provider)
      ? this.provider.move(from, to)
      : this.operations.move(from, to);
  }

  public cdnUrl(key: string, options: CdnUrlOptions): string {
    return buildCdnUrl(key, options);
  }
}
