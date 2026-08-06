import { Readable } from 'node:stream';
import { createS3Driver } from '../s3/s3-driver.factory';
import { createAzureBlobDriver } from '../azure/azure-driver.factory';
import { createGcsDriver } from '../gcs/gcs-driver.factory';

describe('storage driver factories', () => {
  it('adapts every AWS S3 command and metadata branch', async () => {
    class Command {
      public constructor(
        public readonly input: Readonly<Record<string, unknown>>,
        public readonly kind: string,
      ) {}
    }
    class PutObjectCommand extends Command {
      public constructor(input: Readonly<Record<string, unknown>>) {
        super(input, 'put');
      }
    }
    class GetObjectCommand extends Command {
      public constructor(input: Readonly<Record<string, unknown>>) {
        super(input, 'get');
      }
    }
    class DeleteObjectCommand extends Command {
      public constructor(input: Readonly<Record<string, unknown>>) {
        super(input, 'delete');
      }
    }
    class HeadObjectCommand extends Command {
      public constructor(input: Readonly<Record<string, unknown>>) {
        super(input, 'head');
      }
    }
    const send = jest.fn(async (command: Command) =>
      command.kind === 'get'
        ? {
            Body: Buffer.from('body'),
            ContentLength: 4,
            ContentType: 'text/plain',
            LastModified: new Date(1),
            ETag: 'etag',
          }
        : {},
    );
    class S3Client {
      public constructor(
        public readonly config: Readonly<Record<string, unknown>>,
      ) {}
      public send(command: Command): Promise<Record<string, unknown>> {
        return send(command);
      }
    }
    const getSignedUrl = jest.fn(async () => 'signed');
    const resolver = (specifier: string): unknown =>
      specifier === '@aws-sdk/client-s3'
        ? {
            S3Client,
            PutObjectCommand,
            GetObjectCommand,
            DeleteObjectCommand,
            HeadObjectCommand,
          }
        : { getSignedUrl };
    const driver = createS3Driver({ region: 'test' }, resolver);
    await expect(
      driver.putObject({
        bucket: 'bucket',
        key: 'key',
        body: Buffer.from('x'),
        contentType: 'text/plain',
        metadata: { a: 'b' },
      }),
    ).resolves.toMatchObject({});
    await expect(driver.getObject('bucket', 'key')).resolves.toMatchObject({
      contentLength: 4,
      contentType: 'text/plain',
      checksum: 'etag',
    });
    await expect(driver.headObject('bucket', 'key')).resolves.toMatchObject({});
    await driver.deleteObject('bucket', 'key');
    await expect(
      driver.getSignedUrl('bucket', 'key', {
        expiresInSeconds: 10,
        operation: 'put',
      }),
    ).resolves.toBe('signed');
    await driver.getSignedUrl('bucket', 'key', { expiresInSeconds: 10 });
    expect(send).toHaveBeenCalledTimes(4);
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('adapts all Azure blob operations and SAS modes', async () => {
    const response = {
      readableStreamBody: Readable.from('azure'),
      contentLength: 5,
      contentType: 'text/plain',
      lastModified: new Date(1),
      etag: 'etag',
    };
    const blob = {
      url: 'https://blob',
      uploadData: jest.fn(async () => response),
      download: jest.fn(async () => response),
      deleteIfExists: jest.fn(async () => ({ succeeded: true })),
      exists: jest.fn(async () => true),
      getProperties: jest.fn(async () => response),
      generateSasUrl: jest.fn(async () => 'sas'),
    };
    const getBlockBlobClient = jest.fn(() => blob);
    const getContainerClient = jest.fn(() => ({ getBlockBlobClient }));
    const fromConnectionString = jest.fn(() => ({ getContainerClient }));
    const driver = createAzureBlobDriver('connection', 'container', () => ({
      BlobServiceClient: { fromConnectionString },
    }));
    await expect(
      driver.upload('key', Buffer.from('x'), {
        contentType: 'text/plain',
        metadata: { a: 'b' },
      }),
    ).resolves.toMatchObject({ size: 5, checksum: 'etag' });
    await expect(driver.download('key')).resolves.toMatchObject({ size: 5 });
    await expect(driver.delete('key')).resolves.toBe(true);
    await expect(driver.exists('key')).resolves.toBe(true);
    await expect(driver.properties('key')).resolves.toMatchObject({ size: 5 });
    await expect(
      driver.signedUrl('key', { expiresInSeconds: 1 }),
    ).resolves.toBe('sas');
    await driver.signedUrl('key', {
      expiresInSeconds: 1,
      operation: 'put',
    });
    expect(blob.generateSasUrl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ permissions: 'r' }),
    );
    expect(blob.generateSasUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ permissions: 'cw' }),
    );
  });

  it('adapts all GCS operations and metadata branches', async () => {
    const metadata = {
      size: '3',
      contentType: 'text/plain',
      updated: '2020-01-01T00:00:00.000Z',
      md5Hash: 'hash',
    };
    const file = {
      save: jest.fn(async () => undefined),
      download: jest.fn(async (): Promise<[Buffer]> => [Buffer.from('gcs')]),
      createReadStream: jest.fn(() => Readable.from('gcs')),
      delete: jest.fn(async () => undefined),
      exists: jest.fn(async (): Promise<[boolean]> => [true]),
      getMetadata: jest.fn(async () => [metadata] as const),
      getSignedUrl: jest.fn(async (): Promise<[string]> => ['signed']),
    };
    const bucket = jest.fn(() => ({ file: jest.fn(() => file) }));
    class Storage {
      public bucket(name: string): ReturnType<typeof bucket> {
        return bucket(name);
      }
    }
    const driver = createGcsDriver('bucket', { projectId: 'test' }, () => ({
      Storage,
    }));
    expect(
      createGcsDriver('bucket', undefined, () => ({ Storage })),
    ).toBeDefined();
    await expect(
      driver.save('key', Buffer.from('abc'), {
        contentType: 'text/plain',
        metadata: { a: 'b' },
      }),
    ).resolves.toEqual({ size: 3, contentType: 'text/plain' });
    await expect(driver.download('key')).resolves.toEqual({
      body: Buffer.from('gcs'),
    });
    expect(driver.stream('key')).toBeInstanceOf(Readable);
    await expect(driver.delete('key')).resolves.toBe(true);
    await expect(driver.exists('key')).resolves.toBe(true);
    await expect(driver.metadata('key')).resolves.toMatchObject({
      size: 3,
      checksum: 'hash',
    });
    await driver.signedUrl('key', { expiresInSeconds: 1 });
    await driver.signedUrl('key', {
      expiresInSeconds: 1,
      operation: 'put',
    });
    file.getMetadata.mockResolvedValueOnce([{}]);
    await expect(driver.metadata('empty')).resolves.toEqual({
      size: undefined,
      contentType: undefined,
      lastModified: undefined,
      checksum: undefined,
    });
    expect(file.getSignedUrl).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: 'read' }),
    );
    expect(file.getSignedUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: 'write' }),
    );
  });
});
