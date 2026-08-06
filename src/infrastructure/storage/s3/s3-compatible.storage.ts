import { Readable } from 'node:stream';
import type {
  SignedUrlOptions,
  StorageObjectMetadata,
  StoragePutOptions,
} from '../../../platform/storage/storage-provider.interface';
import {
  BaseStorageProvider,
  type BaseStorageOptions,
} from '../base-storage.provider';

export interface S3Object {
  readonly body?: Buffer | Uint8Array | Readable;
  readonly contentLength?: number;
  readonly contentType?: string;
  readonly lastModified?: Date;
  readonly checksum?: string;
}

export interface S3DriverPort {
  putObject(input: {
    readonly bucket: string;
    readonly key: string;
    readonly body: Buffer;
    readonly contentType?: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }): Promise<S3Object>;
  getObject(bucket: string, key: string): Promise<S3Object>;
  deleteObject(bucket: string, key: string): Promise<void>;
  headObject(bucket: string, key: string): Promise<S3Object>;
  getSignedUrl(
    bucket: string,
    key: string,
    options: SignedUrlOptions,
  ): Promise<string>;
}

export interface S3CompatibleStorageOptions extends BaseStorageOptions {
  readonly bucket: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  readonly providerName?: 's3' | 'minio' | 'r2' | 'supabase';
}

export class S3CompatibleStorage extends BaseStorageProvider {
  public readonly name: string;

  public constructor(
    private readonly options: S3CompatibleStorageOptions,
    private readonly driver: S3DriverPort,
  ) {
    super(options);
    this.name = options.providerName ?? 's3';
  }

  protected putObject(
    key: string,
    body: Buffer,
    options: StoragePutOptions,
  ): Promise<Partial<StorageObjectMetadata>> {
    return this.driver.putObject({
      bucket: this.options.bucket,
      key,
      body,
      ...(options.contentType === undefined
        ? {}
        : { contentType: options.contentType }),
      ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    });
  }

  protected async getObject(key: string): Promise<Buffer> {
    return toBuffer(
      (await this.driver.getObject(this.options.bucket, key)).body,
    );
  }

  protected async getObjectStream(key: string): Promise<Readable> {
    const body = (await this.driver.getObject(this.options.bucket, key)).body;
    return body instanceof Readable
      ? body
      : Readable.from(await toBuffer(body));
  }

  protected async deleteObject(key: string): Promise<boolean> {
    if (!(await this.objectExists(key))) {
      return false;
    }
    await this.driver.deleteObject(this.options.bucket, key);
    return true;
  }

  protected async objectExists(key: string): Promise<boolean> {
    try {
      await this.driver.headObject(this.options.bucket, key);
      return true;
    } catch (error: unknown) {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    }
  }

  protected async statObject(
    key: string,
  ): Promise<Partial<StorageObjectMetadata>> {
    const value = await this.driver.headObject(this.options.bucket, key);
    return {
      size: value.contentLength,
      contentType: value.contentType,
      lastModified: value.lastModified,
      checksum: value.checksum,
    };
  }

  protected createSignedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    return this.driver.getSignedUrl(this.options.bucket, key, options);
  }
}

async function streamBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}

function toBuffer(value: S3Object['body']): Buffer | Promise<Buffer> {
  if (value === undefined) {
    return Buffer.alloc(0);
  }
  if (value instanceof Readable) {
    return streamBuffer(value);
  }
  return Buffer.from(value);
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('name' in error && error.name === 'NotFound') ||
      ('statusCode' in error && error.statusCode === 404))
  );
}
