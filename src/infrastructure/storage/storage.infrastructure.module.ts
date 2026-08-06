import { DynamicModule, Module } from '@nestjs/common';
import { STORAGE_PROVIDER } from '../../platform/storage';
import type { StorageProvider } from '../../platform/storage';
import { LocalFilesystemStorage } from './local/local-filesystem.storage';
import { S3CompatibleStorage } from './s3/s3-compatible.storage';
import { createS3Driver } from './s3/s3-driver.factory';
import { AzureBlobStorage } from './azure/azure-blob.storage';
import { createAzureBlobDriver } from './azure/azure-driver.factory';
import { GcsStorage } from './gcs/gcs.storage';
import { createGcsDriver } from './gcs/gcs-driver.factory';

export type StorageKind =
  'local' | 's3' | 'minio' | 'azure' | 'gcs' | 'r2' | 'supabase';
export interface StorageInfrastructureOptions {
  readonly provider?: StorageKind;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

@Module({})
export class StorageInfrastructureModule {
  public static register(
    options: StorageInfrastructureOptions = {},
  ): DynamicModule {
    const environment = options.environment ?? process.env;
    const provider =
      options.provider ??
      environment.STORAGE_PROVIDER ??
      environment.STORAGE_ENGINE ??
      'local';
    return {
      module: StorageInfrastructureModule,
      providers: [
        {
          provide: STORAGE_PROVIDER,
          useFactory: (): StorageProvider =>
            createProvider(provider, environment),
        },
      ],
      exports: [STORAGE_PROVIDER],
    };
  }
}

function createProvider(
  provider: string,
  env: Readonly<Record<string, string | undefined>>,
): StorageProvider {
  const maxBytes = numberValue(env.STORAGE_MAX_BYTES);
  const allowedContentTypes = env.STORAGE_ALLOWED_CONTENT_TYPES?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const security = { maxBytes, allowedContentTypes };
  switch (provider) {
    case 'local':
      return new LocalFilesystemStorage({
        ...security,
        baseDirectory: env.STORAGE_LOCAL_DIRECTORY ?? './storage',
        signingSecret: required(
          env.STORAGE_SIGNING_SECRET,
          'STORAGE_SIGNING_SECRET',
        ),
        publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL,
      });
    case 's3':
    case 'minio':
    case 'r2':
    case 'supabase': {
      // R2 and Supabase Storage are always accessed via a project-specific
      // S3-compatible endpoint; AWS S3 and (typically local) MinIO leave it optional.
      const endpoint =
        provider === 'r2' || provider === 'supabase'
          ? required(env.STORAGE_ENDPOINT, 'STORAGE_ENDPOINT')
          : env.STORAGE_ENDPOINT;
      // Only real AWS S3 supports virtual-hosted-style addressing reliably;
      // MinIO, Cloudflare R2 and Supabase Storage all require path-style.
      const forcePathStyle = provider !== 's3';
      return new S3CompatibleStorage(
        {
          ...security,
          bucket: required(env.STORAGE_BUCKET, 'STORAGE_BUCKET'),
          endpoint,
          forcePathStyle,
          providerName: provider,
        },
        createS3Driver({
          region: env.AWS_REGION,
          endpoint,
          forcePathStyle,
          ...(env.AWS_ACCESS_KEY_ID === undefined ||
          env.AWS_SECRET_ACCESS_KEY === undefined
            ? {}
            : {
                credentials: {
                  accessKeyId: env.AWS_ACCESS_KEY_ID,
                  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
                },
              }),
        }),
      );
    }
    case 'azure':
      return new AzureBlobStorage(
        createAzureBlobDriver(
          required(
            env.AZURE_STORAGE_CONNECTION_STRING,
            'AZURE_STORAGE_CONNECTION_STRING',
          ),
          required(env.STORAGE_CONTAINER, 'STORAGE_CONTAINER'),
        ),
        security,
      );
    case 'gcs':
      return new GcsStorage(
        createGcsDriver(required(env.STORAGE_BUCKET, 'STORAGE_BUCKET')),
        security,
      );
    default:
      throw new Error(
        `Invalid STORAGE_PROVIDER "${provider}". Expected local, s3, minio, r2, supabase, azure, or gcs`,
      );
  }
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required storage setting: ${name}`);
  }
  return value;
}

function numberValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('STORAGE_MAX_BYTES must be a non-negative integer');
  }
  return result;
}
