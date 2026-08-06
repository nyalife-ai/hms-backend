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

export interface AzureBlobObject {
  readonly body?: Buffer | Readable;
  readonly size?: number;
  readonly contentType?: string;
  readonly lastModified?: Date;
  readonly checksum?: string;
}
export interface AzureBlobDriverPort {
  upload(
    key: string,
    body: Buffer,
    options: StoragePutOptions,
  ): Promise<AzureBlobObject>;
  download(key: string): Promise<AzureBlobObject>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  properties(key: string): Promise<AzureBlobObject>;
  signedUrl(key: string, options: SignedUrlOptions): Promise<string>;
}

export class AzureBlobStorage extends BaseStorageProvider {
  public readonly name = 'azure';
  public constructor(
    private readonly driver: AzureBlobDriverPort,
    options: BaseStorageOptions = {},
  ) {
    super(options);
  }
  protected putObject(
    key: string,
    body: Buffer,
    options: StoragePutOptions,
  ): Promise<Partial<StorageObjectMetadata>> {
    return this.driver.upload(key, body, options);
  }
  protected async getObject(key: string): Promise<Buffer> {
    return bodyToBuffer((await this.driver.download(key)).body);
  }
  protected async getObjectStream(key: string): Promise<Readable> {
    const body = (await this.driver.download(key)).body;
    return body instanceof Readable
      ? body
      : Readable.from(body ?? Buffer.alloc(0));
  }
  protected deleteObject(key: string): Promise<boolean> {
    return this.driver.delete(key);
  }
  protected objectExists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }
  protected statObject(key: string): Promise<Partial<StorageObjectMetadata>> {
    return this.driver.properties(key);
  }
  protected createSignedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    return this.driver.signedUrl(key, options);
  }
}

async function bodyToBuffer(body: AzureBlobObject['body']): Promise<Buffer> {
  if (!(body instanceof Readable)) {
    return body ?? Buffer.alloc(0);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}
