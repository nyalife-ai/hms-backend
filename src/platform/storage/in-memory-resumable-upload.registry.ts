import { randomUUID } from 'node:crypto';
import { NotFoundException } from '../../core/exceptions/not-found.exception';
import type {
  ResumableUploadHooks,
  ResumableUploadSession,
} from './resumable-upload.interface';
import type {
  StorageObjectMetadata,
  StoragePutOptions,
  StorageProvider,
} from './storage-provider.interface';
import { assertSafeKey, assertWithinSizeLimit } from './storage-security';

interface SessionRecord {
  session: ResumableUploadSession;
  readonly chunks: Buffer[];
  readonly options: StoragePutOptions;
}

export interface InMemoryResumableUploadRegistryOptions {
  readonly maxBytes?: number;
}

/**
 * Process-local {@link ResumableUploadHooks} implementation. **Not durable**
 * — sessions and buffered chunks live only in memory and are lost on
 * restart. Intended for tests and single-instance deployments; production
 * multi-instance setups need a provider-native resumable upload API.
 */
export class InMemoryResumableUploadRegistry implements ResumableUploadHooks {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly maxBytes: number;

  public constructor(
    private readonly provider: StorageProvider,
    options: InMemoryResumableUploadRegistryOptions = {},
  ) {
    this.maxBytes = options.maxBytes ?? Number.MAX_SAFE_INTEGER;
  }

  public async start(
    key: string,
    totalBytes?: number,
    options: StoragePutOptions = {},
  ): Promise<ResumableUploadSession> {
    await Promise.resolve();
    assertSafeKey(key);
    const now = new Date();
    const session: ResumableUploadSession = {
      id: randomUUID(),
      key,
      ...(totalBytes === undefined ? {} : { totalBytes }),
      receivedBytes: 0,
      createdAt: now,
      updatedAt: now,
      completed: false,
    };
    this.sessions.set(session.id, { session, chunks: [], options });
    return session;
  }

  public async appendChunk(
    sessionId: string,
    chunk: Buffer,
  ): Promise<ResumableUploadSession> {
    await Promise.resolve();
    const record = this.require(sessionId);
    if (record.session.completed) {
      throw new Error(
        `Resumable upload session '${sessionId}' is already completed`,
      );
    }
    const receivedBytes = record.session.receivedBytes + chunk.byteLength;
    assertWithinSizeLimit(receivedBytes, this.maxBytes);
    if (
      record.session.totalBytes !== undefined &&
      receivedBytes > record.session.totalBytes
    ) {
      throw new RangeError(
        `Resumable upload session '${sessionId}' exceeded declared totalBytes`,
      );
    }
    record.chunks.push(Buffer.from(chunk));
    record.session = {
      ...record.session,
      receivedBytes,
      updatedAt: new Date(),
    };
    return record.session;
  }

  public async complete(sessionId: string): Promise<StorageObjectMetadata> {
    const record = this.require(sessionId);
    if (record.session.completed) {
      throw new Error(
        `Resumable upload session '${sessionId}' is already completed`,
      );
    }
    const body = Buffer.concat(record.chunks);
    const metadata = await this.provider.put(
      record.session.key,
      body,
      record.options,
    );
    record.session = {
      ...record.session,
      completed: true,
      updatedAt: new Date(),
    };
    return metadata;
  }

  public async abort(sessionId: string): Promise<void> {
    await Promise.resolve();
    this.require(sessionId);
    this.sessions.delete(sessionId);
  }

  public async getSession(
    sessionId: string,
  ): Promise<ResumableUploadSession | undefined> {
    await Promise.resolve();
    return this.sessions.get(sessionId)?.session;
  }

  private require(sessionId: string): SessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new NotFoundException('Resumable upload session', sessionId);
    }
    return record;
  }
}
