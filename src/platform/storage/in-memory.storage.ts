import { Readable } from 'node:stream';
import { NotFoundException } from '../../core/exceptions/not-found.exception';
import type { ExtendedStorageProvider } from './extended-storage-provider.interface';
import type {
  SignedUrlOptions,
  StorageObjectMetadata,
  StoragePutOptions,
} from './storage-provider.interface';
import {
  assertAllowedContentType,
  assertSafeKey,
  assertWithinSizeLimit,
  computeChecksum,
} from './storage-security';

export interface InMemoryStorageOptions {
  readonly maxBytes?: number;
  readonly allowedContentTypes?: readonly string[];
  readonly clock?: () => Date;
}

interface StoredObject {
  readonly body: Buffer;
  readonly metadata: StorageObjectMetadata;
}

/**
 * In-process {@link ExtendedStorageProvider} used by unit tests and local
 * development. **Not durable** — all objects are lost when the process
 * exits.
 */
export class InMemoryStorage implements ExtendedStorageProvider {
  public readonly name = 'in-memory';
  private readonly objects = new Map<string, StoredObject>();
  private readonly maxBytes: number;
  private readonly allowedContentTypes: readonly string[];
  private readonly clock: () => Date;

  public constructor(options: InMemoryStorageOptions = {}) {
    this.maxBytes = options.maxBytes ?? Number.MAX_SAFE_INTEGER;
    this.allowedContentTypes = options.allowedContentTypes ?? [];
    this.clock = options.clock ?? ((): Date => new Date());
  }

  public async put(
    key: string,
    body: Buffer,
    options: StoragePutOptions = {},
  ): Promise<StorageObjectMetadata> {
    await Promise.resolve();
    assertSafeKey(key);
    assertWithinSizeLimit(body.byteLength, this.maxBytes);
    assertAllowedContentType(options.contentType, this.allowedContentTypes);
    const metadata: StorageObjectMetadata = {
      key,
      size: body.byteLength,
      ...(options.contentType === undefined
        ? {}
        : { contentType: options.contentType }),
      lastModified: this.clock(),
      checksum: computeChecksum(body),
    };
    this.objects.set(key, { body: Buffer.from(body), metadata });
    return metadata;
  }

  public async get(key: string): Promise<Buffer> {
    await Promise.resolve();
    assertSafeKey(key);
    return Buffer.from(this.require(key).body);
  }

  public async getStream(key: string): Promise<Readable> {
    return Readable.from(await this.get(key));
  }

  public async delete(key: string): Promise<boolean> {
    await Promise.resolve();
    assertSafeKey(key);
    return this.objects.delete(key);
  }

  public async exists(key: string): Promise<boolean> {
    await Promise.resolve();
    assertSafeKey(key);
    return this.objects.has(key);
  }

  public async stat(key: string): Promise<StorageObjectMetadata> {
    await Promise.resolve();
    assertSafeKey(key);
    return this.require(key).metadata;
  }

  public async signedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    await Promise.resolve();
    assertSafeKey(key);
    if (
      !Number.isInteger(options.expiresInSeconds) ||
      options.expiresInSeconds < 1
    ) {
      throw new RangeError('expiresInSeconds must be a positive integer');
    }
    const operation = options.operation ?? 'get';
    return `memory://${encodeURIComponent(key)}?operation=${operation}&expiresIn=${options.expiresInSeconds}`;
  }

  public async copy(from: string, to: string): Promise<StorageObjectMetadata> {
    const source = this.require(from);
    return this.put(to, source.body, {
      ...(source.metadata.contentType === undefined
        ? {}
        : { contentType: source.metadata.contentType }),
    });
  }

  public async move(from: string, to: string): Promise<StorageObjectMetadata> {
    const metadata = await this.copy(from, to);
    await this.delete(from);
    return metadata;
  }

  /** Test utility — removes every stored object. */
  public clear(): void {
    this.objects.clear();
  }

  private require(key: string): StoredObject {
    const entry = this.objects.get(key);
    if (!entry) {
      throw new NotFoundException('Storage object', key);
    }
    return entry;
  }
}
