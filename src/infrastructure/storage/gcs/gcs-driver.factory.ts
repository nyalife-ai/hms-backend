import type { Readable } from 'node:stream';
import type { ModuleResolver } from '../../optional-driver';
import { loadDriver } from '../../optional-driver';
import type { GcsDriverPort, GcsObject } from './gcs.storage';

interface GcsMetadata {
  readonly size?: string | number;
  readonly contentType?: string;
  readonly updated?: string;
  readonly md5Hash?: string;
}
interface GcsFile {
  save(body: Buffer, options: Readonly<Record<string, unknown>>): Promise<void>;
  download(): Promise<[Buffer]>;
  createReadStream(): Readable;
  delete(options: { readonly ignoreNotFound: true }): Promise<void>;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[GcsMetadata]>;
  getSignedUrl(options: Readonly<Record<string, unknown>>): Promise<[string]>;
}
interface GcsModule {
  readonly Storage: new (options?: Readonly<Record<string, unknown>>) => {
    bucket(name: string): { file(key: string): GcsFile };
  };
}

export function createGcsDriver(
  bucketName: string,
  clientOptions: Readonly<Record<string, unknown>> = {},
  resolver?: ModuleResolver,
): GcsDriverPort {
  const gcs = loadDriver<GcsModule>('@google-cloud/storage', resolver);
  const bucket = new gcs.Storage(clientOptions).bucket(bucketName);
  const file = (key: string): GcsFile => bucket.file(key);
  return {
    save: async (key, body, options) => {
      await file(key).save(body, {
        contentType: options.contentType,
        metadata: options.metadata,
      });
      return { size: body.byteLength, contentType: options.contentType };
    },
    download: async (key) => ({ body: (await file(key).download())[0] }),
    stream: (key) => file(key).createReadStream(),
    delete: async (key) => {
      const existed = (await file(key).exists())[0];
      await file(key).delete({ ignoreNotFound: true });
      return existed;
    },
    exists: async (key) => (await file(key).exists())[0],
    metadata: async (key) => map((await file(key).getMetadata())[0]),
    signedUrl: async (key, options) =>
      (
        await file(key).getSignedUrl({
          action: (options.operation ?? 'get') === 'get' ? 'read' : 'write',
          expires: Date.now() + options.expiresInSeconds * 1000,
        })
      )[0],
  };
}

function map(value: GcsMetadata): GcsObject {
  return {
    size: value.size === undefined ? undefined : Number(value.size),
    contentType: value.contentType,
    lastModified:
      value.updated === undefined ? undefined : new Date(value.updated),
    checksum: value.md5Hash,
  };
}
