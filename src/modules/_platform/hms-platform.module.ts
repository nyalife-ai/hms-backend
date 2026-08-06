/**
 * HMS platform composition: optional Supabase storage + realtime.
 * Redis is NOT required — missing storage credentials fall back to memory.
 */

import { Global, Module } from '@nestjs/common';
import { RealtimeModule } from '../../platform/realtime/realtime.module';
import { STORAGE_PROVIDER } from '../../platform/storage';
import { InMemoryStorage } from '../../platform/storage/in-memory.storage';
import { LocalFilesystemStorage } from '../../infrastructure/storage/local/local-filesystem.storage';
import { S3CompatibleStorage } from '../../infrastructure/storage/s3/s3-compatible.storage';
import { createS3Driver } from '../../infrastructure/storage/s3/s3-driver.factory';
import type { StorageProvider } from '../../platform/storage';

function createStorageFromEnv(): StorageProvider {
  const kind = (
    process.env.STORAGE_PROVIDER ||
    process.env.STORAGE_ENGINE ||
    'memory'
  ).toLowerCase();

  if (kind === 'memory' || kind === 'in-memory') {
    return new InMemoryStorage();
  }

  const maxBytes = Number(process.env.STORAGE_MAX_BYTES || 10_485_760);
  const allowedContentTypes = process.env.STORAGE_ALLOWED_CONTENT_TYPES?.split(
    ',',
  )
    .map((v) => v.trim())
    .filter(Boolean);
  const security = { maxBytes, allowedContentTypes };

  try {
    if (kind === 'local') {
      return new LocalFilesystemStorage({
        ...security,
        baseDirectory: process.env.STORAGE_LOCAL_DIRECTORY ?? './storage',
        signingSecret:
          process.env.STORAGE_SIGNING_SECRET || 'dev-signing-secret-change-me',
        publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL,
      });
    }

    if (
      kind === 'supabase' ||
      kind === 's3' ||
      kind === 'minio' ||
      kind === 'r2'
    ) {
      const endpoint = process.env.STORAGE_ENDPOINT;
      const bucket = process.env.STORAGE_BUCKET;
      const accessKey = process.env.STORAGE_ACCESS_KEY;
      const secretKey = process.env.STORAGE_SECRET_KEY;
      if (!bucket || !accessKey || !secretKey || !endpoint) {
        return new InMemoryStorage();
      }
      return new S3CompatibleStorage(
        {
          ...security,
          bucket,
          endpoint,
          forcePathStyle: kind !== 's3',
          providerName: kind === 'supabase' ? 'supabase' : kind,
        },
        createS3Driver({
          endpoint,
          region: process.env.STORAGE_REGION || 'auto',
          forcePathStyle: kind !== 's3',
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          },
        }),
      );
    }
  } catch {
    return new InMemoryStorage();
  }

  return new InMemoryStorage();
}

@Global()
@Module({
  imports: [
    RealtimeModule.register({
      allowInMemory: true,
      env: process.env,
    }),
  ],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useFactory: (): StorageProvider => createStorageFromEnv(),
    },
  ],
  exports: [STORAGE_PROVIDER, RealtimeModule],
})
export class HmsPlatformModule {}
