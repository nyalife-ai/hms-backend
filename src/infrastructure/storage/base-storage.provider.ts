import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { ExtendedStorageProvider } from '../../platform/storage/extended-storage-provider.interface';
import type {
  SignedUrlOptions,
  StorageObjectMetadata,
  StoragePutOptions,
} from '../../platform/storage/storage-provider.interface';
import {
  assertAllowedContentType,
  assertSafeKey,
  assertWithinSizeLimit,
} from '../../platform/storage/storage-security';

export interface BaseStorageOptions {
  readonly maxBytes?: number;
  readonly allowedContentTypes?: readonly string[];
}

export abstract class BaseStorageProvider implements ExtendedStorageProvider {
  public abstract readonly name: string;
  private readonly maxBytes: number;
  private readonly allowedContentTypes: readonly string[];

  protected constructor(options: BaseStorageOptions) {
    this.maxBytes = options.maxBytes ?? Number.MAX_SAFE_INTEGER;
    this.allowedContentTypes = options.allowedContentTypes ?? [];
  }

  public async put(
    key: string,
    body: Buffer,
    options: StoragePutOptions = {},
  ): Promise<StorageObjectMetadata> {
    assertSafeKey(key);
    assertWithinSizeLimit(body.byteLength, this.maxBytes);
    assertAllowedContentType(options.contentType, this.allowedContentTypes);
    const metadata = await this.putObject(key, body, options);
    return this.mapMetadata(key, metadata, body);
  }

  public async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    return this.getObject(key);
  }

  public async getStream(key: string): Promise<Readable> {
    assertSafeKey(key);
    return this.getObjectStream(key);
  }

  public async delete(key: string): Promise<boolean> {
    assertSafeKey(key);
    return this.deleteObject(key);
  }

  public async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    return this.objectExists(key);
  }

  public async stat(key: string): Promise<StorageObjectMetadata> {
    assertSafeKey(key);
    return this.mapMetadata(key, await this.statObject(key));
  }

  public async signedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    assertSafeKey(key);
    if (
      !Number.isInteger(options.expiresInSeconds) ||
      options.expiresInSeconds < 1
    ) {
      throw new RangeError('expiresInSeconds must be a positive integer');
    }
    return this.createSignedUrl(key, options);
  }

  /**
   * Default cross-adapter copy implemented via `get` + `put`. Adapters with
   * server-side copy support (S3 `CopyObject`, etc.) may override this.
   */
  public async copy(from: string, to: string): Promise<StorageObjectMetadata> {
    assertSafeKey(from);
    assertSafeKey(to);
    const body = await this.getObject(from);
    const source = await this.statObject(from).catch(
      (): Partial<StorageObjectMetadata> => ({}),
    );
    const putResult = await this.putObject(to, body, {
      ...(source.contentType === undefined
        ? {}
        : { contentType: source.contentType }),
    });
    return this.mapMetadata(to, putResult, body);
  }

  /** Default cross-adapter move implemented via {@link copy} + `delete`. */
  public async move(from: string, to: string): Promise<StorageObjectMetadata> {
    const metadata = await this.copy(from, to);
    await this.deleteObject(from);
    return metadata;
  }

  protected checksum(body: Buffer): string {
    return createHash('sha256').update(body).digest('hex');
  }

  protected mapMetadata(
    key: string,
    metadata: Partial<StorageObjectMetadata>,
    body?: Buffer,
  ): StorageObjectMetadata {
    return {
      key,
      size: metadata.size ?? body?.byteLength ?? 0,
      ...(metadata.contentType === undefined
        ? {}
        : { contentType: metadata.contentType }),
      ...(metadata.lastModified === undefined
        ? {}
        : { lastModified: metadata.lastModified }),
      ...(metadata.checksum !== undefined
        ? { checksum: metadata.checksum }
        : body === undefined
          ? {}
          : { checksum: this.checksum(body) }),
    };
  }

  protected abstract putObject(
    key: string,
    body: Buffer,
    options: StoragePutOptions,
  ): Promise<Partial<StorageObjectMetadata>>;
  protected abstract getObject(key: string): Promise<Buffer>;
  protected abstract getObjectStream(key: string): Promise<Readable>;
  protected abstract deleteObject(key: string): Promise<boolean>;
  protected abstract objectExists(key: string): Promise<boolean>;
  protected abstract statObject(
    key: string,
  ): Promise<Partial<StorageObjectMetadata>>;
  protected abstract createSignedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string>;
}
