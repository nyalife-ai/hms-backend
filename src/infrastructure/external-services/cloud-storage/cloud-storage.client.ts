import type { Readable } from 'node:stream';
import type {
  SignedUrlOptions,
  StorageObjectMetadata,
  StorageProvider,
  StoragePutOptions,
} from '../../../platform/storage';
import { RetryExecutor, RetryPolicy } from '../../../platform/reliability';
import type { StructuredLogger, Tracer } from '../../../platform/observability';
import type { TimerPort } from '../http/http.types';

export interface CloudStorageClientOptions {
  readonly timeoutMs?: number;
  readonly retryExecutor?: RetryExecutor;
  readonly retryPolicy?: RetryPolicy;
  readonly logger?: StructuredLogger;
  readonly tracer?: Tracer;
  readonly timer?: TimerPort;
}
const nativeTimer: TimerPort = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export class CloudStorageClient implements StorageProvider {
  public readonly name: string;
  private readonly executor: RetryExecutor;
  private readonly policy: RetryPolicy;
  private readonly timer: TimerPort;

  public constructor(
    private readonly provider: StorageProvider,
    private readonly options: CloudStorageClientOptions = {},
  ) {
    this.name = provider.name;
    this.executor = options.retryExecutor ?? new RetryExecutor();
    this.policy =
      options.retryPolicy ?? new RetryPolicy({ maxAttempts: 3, delayMs: 100 });
    this.timer = options.timer ?? nativeTimer;
  }

  public put(
    key: string,
    body: Buffer,
    options?: StoragePutOptions,
  ): Promise<StorageObjectMetadata> {
    return this.run('put', () => this.provider.put(key, body, options));
  }
  public get(key: string): Promise<Buffer> {
    return this.run('get', () => this.provider.get(key));
  }
  public getStream(key: string): Promise<Readable> {
    return this.run('getStream', () => this.provider.getStream(key));
  }
  public delete(key: string): Promise<boolean> {
    return this.run('delete', () => this.provider.delete(key));
  }
  public exists(key: string): Promise<boolean> {
    return this.run('exists', () => this.provider.exists(key));
  }
  public stat(key: string): Promise<StorageObjectMetadata> {
    return this.run('stat', () => this.provider.stat(key));
  }
  public signedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    return this.run('signedUrl', () => this.provider.signedUrl(key, options));
  }

  private run<T>(
    operationName: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.executor.execute(async (attempt) => {
      const span = this.options.tracer?.startSpan(
        `external.storage.${operationName}`,
        { attributes: { provider: this.provider.name, attempt } },
      );
      this.options.logger?.info('External storage operation started', {
        provider: this.provider.name,
        operation: operationName,
        attempt,
      });
      try {
        const result = await this.withTimeout(operation());
        this.options.logger?.info('External storage operation completed', {
          provider: this.provider.name,
          operation: operationName,
        });
        return result;
      } catch {
        const safe = new Error('External storage operation failed');
        span?.recordException(safe);
        this.options.logger?.warn('External storage operation failed', {
          provider: this.provider.name,
          operation: operationName,
          attempt,
        });
        throw safe;
      } finally {
        span?.end();
      }
    }, this.policy);
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let handle: unknown;
    const timeout = new Promise<never>((_, reject) => {
      handle = this.timer.set(
        () => reject(new Error('External storage operation timed out')),
        this.options.timeoutMs ?? 10_000,
      );
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      this.timer.clear(handle);
    }
  }
}
