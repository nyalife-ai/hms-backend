import type { StorageObjectMetadata } from './storage-provider.interface';

export interface ResumableUploadSession {
  readonly id: string;
  readonly key: string;
  readonly totalBytes?: number;
  readonly receivedBytes: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completed: boolean;
}

/**
 * Chunked / resumable upload lifecycle. Infrastructure adapters implement
 * this against provider-native multipart APIs (S3 multipart, GCS resumable
 * sessions, Azure block blobs); {@link InMemoryResumableUploadRegistry}
 * provides a process-local reference implementation for tests.
 */
export interface ResumableUploadHooks {
  start(key: string, totalBytes?: number): Promise<ResumableUploadSession>;
  appendChunk(
    sessionId: string,
    chunk: Buffer,
  ): Promise<ResumableUploadSession>;
  complete(sessionId: string): Promise<StorageObjectMetadata>;
  abort(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<ResumableUploadSession | undefined>;
}
