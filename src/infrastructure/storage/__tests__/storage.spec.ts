import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { STORAGE_PROVIDER } from '../../../platform/storage';
import { MissingDriverError } from '../../optional-driver';
import {
  LocalFilesystemStorage,
  type FileSystemPort,
} from '../local/local-filesystem.storage';
import {
  S3CompatibleStorage,
  type S3DriverPort,
} from '../s3/s3-compatible.storage';
import { createS3Driver } from '../s3/s3-driver.factory';
import {
  AzureBlobStorage,
  type AzureBlobDriverPort,
} from '../azure/azure-blob.storage';
import { createAzureBlobDriver } from '../azure/azure-driver.factory';
import { GcsStorage, type GcsDriverPort } from '../gcs/gcs.storage';
import { createGcsDriver } from '../gcs/gcs-driver.factory';
import { StorageInfrastructureModule } from '../storage.infrastructure.module';

describe('storage infrastructure', () => {
  it('stores, streams, signs and deletes local files concurrently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'storage-test-'));
    try {
      const provider = new LocalFilesystemStorage({
        baseDirectory: root,
        signingSecret: 'test-only-secret',
        publicBaseUrl: 'https://files.example',
        clock: () => 1_000_000,
        maxBytes: 10,
        allowedContentTypes: ['text/*'],
      });
      await Promise.all([
        provider.put('a/one.txt', Buffer.from('one'), {
          contentType: 'text/plain',
        }),
        provider.put('a/two.txt', Buffer.from('two'), {
          contentType: 'text/plain',
        }),
      ]);
      expect(await provider.get('a/one.txt')).toEqual(Buffer.from('one'));
      const stream = await provider.getStream('a/two.txt');
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe('two');
      expect(await provider.exists('a/one.txt')).toBe(true);
      expect((await provider.stat('a/one.txt')).size).toBe(3);
      const url = await provider.signedUrl('a/one.txt', {
        expiresInSeconds: 60,
      });
      const parsed = new URL(url);
      expect(
        provider.verifySignedUrl(
          'a/one.txt',
          Number(parsed.searchParams.get('expires')),
          parsed.searchParams.get('token') ?? '',
        ),
      ).toBe(true);
      expect(provider.verifySignedUrl('a/one.txt', 1, 'bad')).toBe(false);
      expect(await provider.delete('a/one.txt')).toBe(true);
      expect(await provider.delete('a/one.txt')).toBe(false);
      expect(await provider.exists('a/one.txt')).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('applies common security policy', async () => {
    const provider = new LocalFilesystemStorage({
      baseDirectory: '/unused',
      signingSecret: 'secret',
      maxBytes: 2,
      allowedContentTypes: ['image/*'],
    });
    await expect(provider.put('../x', Buffer.from('x'))).rejects.toThrow();
    await expect(provider.put('x', Buffer.from('xxx'))).rejects.toThrow();
    await expect(
      provider.put('x', Buffer.from('x'), { contentType: 'text/plain' }),
    ).rejects.toThrow();
    await expect(
      provider.signedUrl('x', { expiresInSeconds: 0 }),
    ).rejects.toThrow(RangeError);
  });

  it('covers local filesystem failure propagation and default URL options', async () => {
    const failure = new Error('disk failed');
    const fileSystem: FileSystemPort = {
      readFile: jest.fn(async () => Buffer.from('x')),
      writeFile: jest.fn(async () => undefined),
      unlink: jest.fn(async () => {
        throw failure;
      }),
      stat: jest.fn(async () => {
        throw failure;
      }),
      createReadStream: jest.fn(() => Readable.from('x')),
      mkdir: jest.fn(async () => undefined),
    };
    const provider = new LocalFilesystemStorage(
      {
        baseDirectory: '/root',
        signingSecret: 'secret',
        clock: () => 1_000_000,
      },
      fileSystem,
    );
    await expect(provider.delete('x')).rejects.toBe(failure);
    await expect(provider.exists('x')).rejects.toBe(failure);
    const url = await provider.signedUrl('x', {
      expiresInSeconds: 1,
      operation: 'put',
    });
    expect(url).toContain('file://local/x');
    expect(provider.verifySignedUrl('x', 1001, '0'.repeat(64))).toBe(false);

    const primitiveFailure = new LocalFilesystemStorage(
      { baseDirectory: '/root', signingSecret: 'secret' },
      {
        ...fileSystem,
        unlink: jest.fn(async () => {
          throw 'failure';
        }),
        stat: jest.fn(async () => {
          throw null;
        }),
      },
    );
    await expect(primitiveFailure.delete('x')).rejects.toBe('failure');
    await expect(primitiveFailure.exists('x')).rejects.toBeNull();

    const pathFor = Reflect.get(provider, 'pathFor');
    if (typeof pathFor !== 'function') {
      throw new Error('Expected pathFor function');
    }
    expect(() => pathFor.call(provider, '../escape')).toThrow(
      'escapes the configured root',
    );
  });

  it('adapts S3 including streams, missing objects, and signed URLs', async () => {
    const objects = new Map<string, Buffer>();
    const driver: S3DriverPort = {
      putObject: jest.fn(async ({ key, body }) => {
        objects.set(key, body);
        return { contentLength: body.length };
      }),
      getObject: jest.fn(async (_bucket, key) => ({
        body:
          key === 'stream'
            ? Readable.from(Buffer.from('stream'))
            : objects.get(key),
      })),
      deleteObject: jest.fn(async (_bucket, key) => {
        objects.delete(key);
      }),
      headObject: jest.fn(async (_bucket, key) => {
        if (!objects.has(key)) throw { name: 'NotFound' };
        return { contentLength: objects.get(key)?.length };
      }),
      getSignedUrl: jest.fn(async () => 'https://signed'),
    };
    const storage = new S3CompatibleStorage({ bucket: 'bucket' }, driver);
    await storage.put('x', Buffer.from('x'));
    expect(await storage.get('x')).toEqual(Buffer.from('x'));
    expect(await storage.exists('missing')).toBe(false);
    expect(await storage.delete('missing')).toBe(false);
    expect(await storage.delete('x')).toBe(true);
    objects.set('stream', Buffer.from('stream'));
    expect(await storage.getStream('stream')).toBeInstanceOf(Readable);
    objects.set('buffer-stream', Buffer.from('buffer'));
    expect(await storage.getStream('buffer-stream')).toBeInstanceOf(Readable);
    expect(await storage.signedUrl('stream', { expiresInSeconds: 1 })).toBe(
      'https://signed',
    );
    expect((await storage.stat('stream')).size).toBe(6);
  });

  it('covers S3 body and error variants', async () => {
    const getObject = jest
      .fn()
      .mockResolvedValueOnce({ body: Uint8Array.from([1, 2]) })
      .mockResolvedValueOnce({ body: undefined })
      .mockResolvedValueOnce({
        body: Readable.from([Uint8Array.from([3]), Buffer.from([4])]),
      });
    const headObject = jest
      .fn()
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce(new Error('provider failed'));
    const driver: S3DriverPort = {
      putObject: jest.fn(async () => ({
        contentLength: 1,
        contentType: 'text/plain',
        lastModified: new Date(1),
        checksum: 'driver-checksum',
      })),
      getObject,
      deleteObject: jest.fn(async () => undefined),
      headObject,
      getSignedUrl: jest.fn(async () => 'signed'),
    };
    const provider = new S3CompatibleStorage(
      { bucket: 'bucket', providerName: 'minio' },
      driver,
    );
    expect(provider.name).toBe('minio');
    await expect(provider.get('bytes')).resolves.toEqual(Buffer.from([1, 2]));
    await expect(provider.get('empty')).resolves.toEqual(Buffer.alloc(0));
    await expect(provider.get('stream')).resolves.toEqual(Buffer.from([3, 4]));
    await expect(provider.exists('missing')).resolves.toBe(false);
    await expect(provider.exists('failure')).rejects.toThrow('provider failed');
    const metadata = await provider.put('x', Buffer.from('x'), {
      contentType: 'text/plain',
      metadata: { a: 'b' },
    });
    expect(metadata).toMatchObject({
      contentType: 'text/plain',
      checksum: 'driver-checksum',
    });
  });

  it('adapts Azure and GCS drivers', async () => {
    const azure: AzureBlobDriverPort = {
      upload: jest.fn(async (_key, body) => ({ size: body.length })),
      download: jest.fn(async () => ({ body: Buffer.from('azure') })),
      delete: jest.fn(async () => true),
      exists: jest.fn(async () => true),
      properties: jest.fn(async () => ({ size: 5 })),
      signedUrl: jest.fn(async () => 'azure-url'),
    };
    const azureStorage = new AzureBlobStorage(azure);
    expect(await azureStorage.get('x')).toEqual(Buffer.from('azure'));
    expect(await azureStorage.getStream('x')).toBeInstanceOf(Readable);
    await azureStorage.put('x', Buffer.from('x'));
    expect(await azureStorage.delete('x')).toBe(true);
    expect(await azureStorage.exists('x')).toBe(true);
    expect((await azureStorage.stat('x')).size).toBe(5);
    expect(await azureStorage.signedUrl('x', { expiresInSeconds: 1 })).toBe(
      'azure-url',
    );

    const gcs: GcsDriverPort = {
      save: jest.fn(async (_key, body) => ({ size: body.length })),
      download: jest.fn(async () => ({ body: Buffer.from('gcs') })),
      stream: jest.fn(() => Readable.from('gcs')),
      delete: jest.fn(async () => true),
      exists: jest.fn(async () => true),
      metadata: jest.fn(async () => ({ size: 3 })),
      signedUrl: jest.fn(async () => 'gcs-url'),
    };
    const gcsStorage = new GcsStorage(gcs);
    expect(await gcsStorage.get('x')).toEqual(Buffer.from('gcs'));
    expect(await gcsStorage.getStream('x')).toBeInstanceOf(Readable);
    await gcsStorage.put('x', Buffer.from('x'));
    expect(await gcsStorage.delete('x')).toBe(true);
    expect(await gcsStorage.exists('x')).toBe(true);
    expect((await gcsStorage.stat('x')).size).toBe(3);
    expect(await gcsStorage.signedUrl('x', { expiresInSeconds: 1 })).toBe(
      'gcs-url',
    );
  });

  it('buffers streamed Azure and GCS downloads including empty bodies', async () => {
    const azureDownload = jest
      .fn()
      .mockResolvedValueOnce({
        body: Readable.from([Uint8Array.from([1]), Buffer.from([2])]),
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ body: Readable.from('stream') })
      .mockResolvedValueOnce({});
    const azure = new AzureBlobStorage({
      upload: jest.fn(async () => ({})),
      download: azureDownload,
      delete: jest.fn(async () => false),
      exists: jest.fn(async () => false),
      properties: jest.fn(async () => ({})),
      signedUrl: jest.fn(async () => 'signed'),
    });
    await expect(azure.get('stream')).resolves.toEqual(Buffer.from([1, 2]));
    await expect(azure.get('empty')).resolves.toEqual(Buffer.alloc(0));
    await expect(azure.getStream('stream')).resolves.toBeInstanceOf(Readable);
    await expect(azure.getStream('empty')).resolves.toBeInstanceOf(Readable);
    await expect(azure.stat('empty')).resolves.toEqual({
      key: 'empty',
      size: 0,
    });

    const gcsDownload = jest
      .fn()
      .mockResolvedValueOnce({
        body: Readable.from([Uint8Array.from([3]), Buffer.from([4])]),
      })
      .mockResolvedValueOnce({});
    const gcs = new GcsStorage({
      save: jest.fn(async () => ({})),
      download: gcsDownload,
      stream: jest.fn(() => Readable.from('')),
      delete: jest.fn(async () => false),
      exists: jest.fn(async () => false),
      metadata: jest.fn(async () => ({})),
      signedUrl: jest.fn(async () => 'signed'),
    });
    await expect(gcs.get('stream')).resolves.toEqual(Buffer.from([3, 4]));
    await expect(gcs.get('empty')).resolves.toEqual(Buffer.alloc(0));
  });

  it('reports missing optional cloud drivers', () => {
    const missing = (): never => {
      throw new Error('missing');
    };
    expect(() => createS3Driver({}, missing)).toThrow(MissingDriverError);
    expect(() => createAzureBlobDriver('x', 'y', missing)).toThrow(
      MissingDriverError,
    );
    expect(() => createGcsDriver('x', {}, missing)).toThrow(MissingDriverError);
  });

  it('copies and moves objects using the default get+put(+delete) implementation', async () => {
    const objects = new Map<string, Buffer>();
    const driver: S3DriverPort = {
      putObject: jest.fn(async ({ key, body }) => {
        objects.set(key, body);
        return { contentLength: body.length };
      }),
      getObject: jest.fn(async (_bucket, key) => ({ body: objects.get(key) })),
      deleteObject: jest.fn(async (_bucket, key) => {
        objects.delete(key);
      }),
      headObject: jest.fn(async (_bucket, key) => {
        if (!objects.has(key)) throw { name: 'NotFound' };
        return {
          contentLength: objects.get(key)?.length,
          contentType: 'text/plain',
        };
      }),
      getSignedUrl: jest.fn(async () => 'https://signed'),
    };
    const storage = new S3CompatibleStorage({ bucket: 'bucket' }, driver);
    await storage.put('source', Buffer.from('payload'), {
      contentType: 'text/plain',
    });

    const copied = await storage.copy('source', 'destination');
    expect(copied).toMatchObject({ key: 'destination', size: 7 });
    expect(await storage.exists('source')).toBe(true);
    expect(await storage.exists('destination')).toBe(true);
    expect(driver.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'destination',
        contentType: 'text/plain',
      }),
    );

    const moved = await storage.move('destination', 'final');
    expect(moved.key).toBe('final');
    expect(await storage.exists('destination')).toBe(false);
    expect(await storage.exists('final')).toBe(true);
  });

  it('copies without a content type when the source stat lookup fails', async () => {
    const objects = new Map<string, Buffer>();
    const driver: S3DriverPort = {
      putObject: jest.fn(async ({ key, body }) => {
        objects.set(key, body);
        return { contentLength: body.length };
      }),
      getObject: jest.fn(async (_bucket, key) => ({ body: objects.get(key) })),
      deleteObject: jest.fn(async () => undefined),
      headObject: jest.fn(async () => {
        throw new Error('stat unavailable');
      }),
      getSignedUrl: jest.fn(async () => 'https://signed'),
    };
    const storage = new S3CompatibleStorage({ bucket: 'bucket' }, driver);
    objects.set('source', Buffer.from('x'));
    const copied = await storage.copy('source', 'destination');
    expect(copied.contentType).toBeUndefined();
  });

  it('selects local storage and rejects invalid provider configuration', async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageInfrastructureModule.register({
          provider: 'local',
          environment: {
            STORAGE_SIGNING_SECRET: 'test-secret',
            STORAGE_LOCAL_DIRECTORY: '/tmp/test-storage',
          },
        }),
      ],
    }).compile();
    expect(module.get<LocalFilesystemStorage>(STORAGE_PROVIDER).name).toBe(
      'local',
    );
    await expect(
      Test.createTestingModule({
        imports: [
          StorageInfrastructureModule.register({
            environment: {
              STORAGE_PROVIDER: 'invalid',
              STORAGE_SIGNING_SECRET: 'test-secret',
            },
          }),
        ],
      }).compile(),
    ).rejects.toThrow('Invalid STORAGE_PROVIDER');
  });
});
