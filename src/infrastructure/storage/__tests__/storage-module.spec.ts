import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../platform/storage';
import { StorageInfrastructureModule } from '../storage.infrastructure.module';
import { createS3Driver } from '../s3/s3-driver.factory';
import { createAzureBlobDriver } from '../azure/azure-driver.factory';
import { createGcsDriver } from '../gcs/gcs-driver.factory';

jest.mock('../s3/s3-driver.factory', () => ({
  createS3Driver: jest.fn(() => ({
    putObject: jest.fn(),
    getObject: jest.fn(),
    deleteObject: jest.fn(),
    headObject: jest.fn(),
    getSignedUrl: jest.fn(),
  })),
}));
jest.mock('../azure/azure-driver.factory', () => ({
  createAzureBlobDriver: jest.fn(() => ({
    upload: jest.fn(),
    download: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
    properties: jest.fn(),
    signedUrl: jest.fn(),
  })),
}));
jest.mock('../gcs/gcs-driver.factory', () => ({
  createGcsDriver: jest.fn(() => ({
    save: jest.fn(),
    download: jest.fn(),
    stream: jest.fn(() => Readable.from('')),
    delete: jest.fn(),
    exists: jest.fn(),
    metadata: jest.fn(),
    signedUrl: jest.fn(),
  })),
}));

async function resolveProvider(
  provider:
    'local' | 's3' | 'minio' | 'azure' | 'gcs' | 'r2' | 'supabase' | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<StorageProvider> {
  const module = await Test.createTestingModule({
    imports: [
      StorageInfrastructureModule.register({
        ...(provider === undefined ? {} : { provider }),
        environment,
      }),
    ],
  }).compile();
  return module.get<StorageProvider>(STORAGE_PROVIDER);
}

describe('StorageInfrastructureModule', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds local defaults and parses security settings', async () => {
    const provider = await resolveProvider(undefined, {
      STORAGE_SIGNING_SECRET: 'secret',
      STORAGE_MAX_BYTES: '12',
      STORAGE_ALLOWED_CONTENT_TYPES: ' image/png, ,text/plain ',
      STORAGE_PUBLIC_BASE_URL: 'https://files.test/',
    });
    expect(provider.name).toBe('local');
  });

  it.each(['s3', 'minio'] as const)(
    'builds %s with and without explicit credentials',
    async (kind) => {
      const provider = await resolveProvider(kind, {
        STORAGE_BUCKET: 'bucket',
        STORAGE_ENDPOINT: 'http://storage.test',
        AWS_REGION: 'test',
        ...(kind === 's3'
          ? {}
          : {
              AWS_ACCESS_KEY_ID: 'access',
              AWS_SECRET_ACCESS_KEY: 'secret',
            }),
      });
      expect(provider.name).toBe(kind);
      expect(createS3Driver).toHaveBeenCalledWith(
        expect.objectContaining({ forcePathStyle: kind === 'minio' }),
      );
    },
  );

  it.each(['r2', 'supabase'] as const)(
    'builds %s as a path-style S3-compatible provider',
    async (kind) => {
      const provider = await resolveProvider(kind, {
        STORAGE_BUCKET: 'bucket',
        STORAGE_ENDPOINT: 'https://storage.test',
        AWS_ACCESS_KEY_ID: 'access',
        AWS_SECRET_ACCESS_KEY: 'secret',
      });
      expect(provider.name).toBe(kind);
      expect(createS3Driver).toHaveBeenCalledWith(
        expect.objectContaining({ forcePathStyle: true }),
      );
    },
  );

  it.each(['r2', 'supabase'] as const)(
    'requires STORAGE_ENDPOINT for %s',
    async (kind) => {
      await expect(
        resolveProvider(kind, { STORAGE_BUCKET: 'bucket' }),
      ).rejects.toThrow('STORAGE_ENDPOINT');
    },
  );

  it('accepts STORAGE_ENGINE as an alias for STORAGE_PROVIDER', async () => {
    const provider = await resolveProvider(undefined, {
      STORAGE_ENGINE: 'gcs',
      STORAGE_BUCKET: 'bucket',
    });
    expect(provider.name).toBe('gcs');
  });

  it('prefers STORAGE_PROVIDER over STORAGE_ENGINE when both are set', async () => {
    const provider = await resolveProvider(undefined, {
      STORAGE_PROVIDER: 'gcs',
      STORAGE_ENGINE: 'azure',
      STORAGE_BUCKET: 'bucket',
    });
    expect(provider.name).toBe('gcs');
  });

  it('builds Azure and GCS providers', async () => {
    await expect(
      resolveProvider('azure', {
        AZURE_STORAGE_CONNECTION_STRING: 'connection',
        STORAGE_CONTAINER: 'container',
      }),
    ).resolves.toMatchObject({ name: 'azure' });
    await expect(
      resolveProvider('gcs', { STORAGE_BUCKET: 'bucket' }),
    ).resolves.toMatchObject({ name: 'gcs' });
    expect(createAzureBlobDriver).toHaveBeenCalledWith(
      'connection',
      'container',
    );
    expect(createGcsDriver).toHaveBeenCalledWith('bucket');
  });

  it('uses process environment when options are omitted', async () => {
    const previous = process.env.STORAGE_SIGNING_SECRET;
    process.env.STORAGE_SIGNING_SECRET = 'process-secret';
    try {
      const module = await Test.createTestingModule({
        imports: [StorageInfrastructureModule.register()],
      }).compile();
      expect(module.get<StorageProvider>(STORAGE_PROVIDER).name).toBe('local');
    } finally {
      if (previous === undefined) delete process.env.STORAGE_SIGNING_SECRET;
      else process.env.STORAGE_SIGNING_SECRET = previous;
    }
  });

  it.each([
    [{ provider: 'local' as const, environment: {} }, 'STORAGE_SIGNING_SECRET'],
    [
      { provider: 's3' as const, environment: { STORAGE_BUCKET: '' } },
      'STORAGE_BUCKET',
    ],
    [
      {
        provider: 'azure' as const,
        environment: { AZURE_STORAGE_CONNECTION_STRING: 'connection' },
      },
      'STORAGE_CONTAINER',
    ],
    [{ provider: 'gcs' as const, environment: {} }, 'STORAGE_BUCKET'],
    [
      {
        provider: 'local' as const,
        environment: {
          STORAGE_SIGNING_SECRET: 'secret',
          STORAGE_MAX_BYTES: '-1',
        },
      },
      'STORAGE_MAX_BYTES',
    ],
  ])('rejects invalid configuration %#', async (options, message) => {
    await expect(
      Test.createTestingModule({
        imports: [StorageInfrastructureModule.register(options)],
      }).compile(),
    ).rejects.toThrow(message);
  });
});
