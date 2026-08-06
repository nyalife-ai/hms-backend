import type { Readable } from 'node:stream';

export interface StorageObjectMetadata {
  readonly key: string;
  readonly size: number;
  readonly contentType?: string;
  readonly lastModified?: Date;
  readonly checksum?: string;
}

export interface StoragePutOptions {
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface SignedUrlOptions {
  readonly expiresInSeconds: number;
  readonly operation?: 'get' | 'put';
}

/**
 * Storage port — platform defines the capability, infrastructure implements it
 * (local filesystem, S3/MinIO, Azure Blob, Google Cloud Storage).
 */
export interface StorageProvider {
  readonly name: string;
  put(
    key: string,
    body: Buffer,
    options?: StoragePutOptions,
  ): Promise<StorageObjectMetadata>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<StorageObjectMetadata>;
  signedUrl(key: string, options: SignedUrlOptions): Promise<string>;
}
