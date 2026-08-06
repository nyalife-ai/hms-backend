import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { promises as fsPromises, createReadStream } from 'node:fs';
import type {
  SignedUrlOptions,
  StorageObjectMetadata,
  StoragePutOptions,
} from '../../../platform/storage/storage-provider.interface';
import {
  BaseStorageProvider,
  type BaseStorageOptions,
} from '../base-storage.provider';

export interface FileStat {
  readonly size: number;
  readonly mtime: Date;
}

export interface FileSystemPort {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, body: Buffer): Promise<void>;
  unlink(path: string): Promise<void>;
  stat(path: string): Promise<FileStat>;
  createReadStream(path: string): Readable;
  mkdir(path: string, options: { readonly recursive: true }): Promise<unknown>;
}

const nodeFileSystem: FileSystemPort = {
  readFile: (path) => fsPromises.readFile(path),
  writeFile: (path, body) => fsPromises.writeFile(path, body),
  unlink: (path) => fsPromises.unlink(path),
  stat: async (path) => {
    const value = await fsPromises.stat(path);
    return { size: value.size, mtime: value.mtime };
  },
  createReadStream,
  mkdir: (path, options) => fsPromises.mkdir(path, options),
};

export interface LocalFilesystemStorageOptions extends BaseStorageOptions {
  readonly baseDirectory: string;
  readonly signingSecret: string;
  readonly publicBaseUrl?: string;
  readonly clock?: () => number;
}

export class LocalFilesystemStorage extends BaseStorageProvider {
  public readonly name = 'local';
  private readonly root: string;
  private readonly clock: () => number;

  public constructor(
    private readonly options: LocalFilesystemStorageOptions,
    private readonly fileSystem: FileSystemPort = nodeFileSystem,
  ) {
    super(options);
    this.root = resolve(options.baseDirectory);
    this.clock = options.clock ?? Date.now;
  }

  public verifySignedUrl(key: string, expires: number, token: string): boolean {
    if (expires < Math.floor(this.clock() / 1000)) {
      return false;
    }
    const expected = this.sign(key, expires, 'get');
    const supplied = Buffer.from(token);
    const expectedBuffer = Buffer.from(expected);
    return (
      supplied.length === expectedBuffer.length &&
      timingSafeEqual(supplied, expectedBuffer)
    );
  }

  protected async putObject(
    key: string,
    body: Buffer,
    options: StoragePutOptions,
  ): Promise<Partial<StorageObjectMetadata>> {
    const path = this.pathFor(key);
    await this.fileSystem.mkdir(resolve(path, '..'), { recursive: true });
    await this.fileSystem.writeFile(path, body);
    return { size: body.byteLength, contentType: options.contentType };
  }

  protected getObject(key: string): Promise<Buffer> {
    return this.fileSystem.readFile(this.pathFor(key));
  }

  protected getObjectStream(key: string): Promise<Readable> {
    return Promise.resolve(this.fileSystem.createReadStream(this.pathFor(key)));
  }

  protected async deleteObject(key: string): Promise<boolean> {
    try {
      await this.fileSystem.unlink(this.pathFor(key));
      return true;
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  protected async objectExists(key: string): Promise<boolean> {
    try {
      await this.fileSystem.stat(this.pathFor(key));
      return true;
    } catch (error: unknown) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  protected async statObject(
    key: string,
  ): Promise<Partial<StorageObjectMetadata>> {
    const value = await this.fileSystem.stat(this.pathFor(key));
    return { size: value.size, lastModified: value.mtime };
  }

  protected createSignedUrl(
    key: string,
    options: SignedUrlOptions,
  ): Promise<string> {
    const operation = options.operation ?? 'get';
    const expires = Math.floor(this.clock() / 1000) + options.expiresInSeconds;
    const token = this.sign(key, expires, operation);
    const base = this.options.publicBaseUrl ?? 'file://local';
    return Promise.resolve(
      `${base.replace(/\/$/, '')}/${encodeURIComponent(key)}?expires=${expires}&operation=${operation}&token=${token}`,
    );
  }

  private pathFor(key: string): string {
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error('Storage key escapes the configured root');
    }
    return path;
  }

  private sign(key: string, expires: number, operation: 'get' | 'put'): string {
    return createHmac('sha256', this.options.signingSecret)
      .update(`${operation}\n${key}\n${expires}`)
      .digest('hex');
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
