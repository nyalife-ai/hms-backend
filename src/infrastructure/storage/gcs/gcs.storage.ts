import { Readable } from 'node:stream';
import type {
  SignedUrlOptions,
  StorageObjectMetadata,
  StoragePutOptions,
} from '../../../platform/storage';
import {
  BaseStorageProvider,
  type BaseStorageOptions,
} from '../base-storage.provider';

export interface GcsObject {
  readonly body?: Buffer | Readable;
  readonly size?: number;
  readonly contentType?: string;
  readonly lastModified?: Date;
  readonly checksum?: string;
}
export interface GcsDriverPort {
  save(
    key: string,
    body: Buffer,
    options: StoragePutOptions,
  ): Promise<GcsObject>;
  download(key: string): Promise<GcsObject>;
  stream(key: string): Readable;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  metadata(key: string): Promise<GcsObject>;
  signedUrl(key: string, options: SignedUrlOptions): Promise<string>;
}

export class GcsStorage extends BaseStorageProvider {
  public readonly name = 'gcs';
  public constructor(
    private readonly driver: GcsDriverPort,
    options: BaseStorageOptions = {},
  ) {
    super(options);
  }
  protected putObject(
    key: string,
    body: Buffer,
    options: StoragePutOptions,
  ): Promise<Partial<StorageObjectMetadata>> {
    return this.driver.save(key, body, options);
  }
  protected async getObject(key: string): Promise<Buffer> {
    const body = (await this.driver.download(key)).body;
    return Buffer.isBuffer(body) ? body : read(body);
  }
  protected getObjectStream(key: string): Promise<Readable> {
    return Promise.resolve(this.driver.stream(key));
  }
  protected deleteObject(key: string): Promise<boolean> {
    return this.driver.delete(key);
  }
  protected objectExists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }
  protected statObject(key: string): Promise<Partial<StorageObjectMetadata>> {
    return this.driver.metadata(key);
  }
  protected createSignedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    return this.driver.signedUrl(key, options);
  }
}

async function read(value: Readable | undefined): Promise<Buffer> {
  if (value === undefined) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of value) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}
