import type { BackupProvider } from './backup-provider.interface';
import type {
  BackupDescriptor,
  CreateBackupInput,
  RestoreBackupResult,
} from './backup.types';

interface StoredBackup {
  readonly descriptor: BackupDescriptor;
  readonly data: Buffer;
}

export interface InMemoryBackupProviderOptions {
  readonly clock?: () => Date;
  readonly idGenerator?: () => string;
}

/**
 * Process-local {@link BackupProvider}. **Not durable** — intended for
 * tests and local development only.
 */
export class InMemoryBackupProvider implements BackupProvider {
  public readonly name = 'in-memory';
  private readonly backups = new Map<string, StoredBackup>();
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;
  private sequence = 0;

  public constructor(options: InMemoryBackupProviderOptions = {}) {
    this.clock = options.clock ?? ((): Date => new Date());
    this.idGenerator =
      options.idGenerator ?? ((): string => `backup-${++this.sequence}`);
  }

  public create(input: CreateBackupInput): Promise<BackupDescriptor> {
    const descriptor: BackupDescriptor = {
      id: this.idGenerator(),
      label: input.label,
      createdAt: this.clock(),
      status: 'completed',
      sizeBytes: input.data.byteLength,
    };
    this.backups.set(descriptor.id, {
      descriptor,
      data: Buffer.from(input.data),
    });
    return Promise.resolve(descriptor);
  }

  public list(): Promise<BackupDescriptor[]> {
    return Promise.resolve(
      [...this.backups.values()].map((entry) => entry.descriptor),
    );
  }

  public get(id: string): Promise<BackupDescriptor | undefined> {
    return Promise.resolve(this.backups.get(id)?.descriptor);
  }

  public async restore(id: string): Promise<RestoreBackupResult> {
    await Promise.resolve();
    const entry = this.backups.get(id);
    if (!entry) {
      throw new Error(`No backup found with id "${id}"`);
    }
    return { id, data: Buffer.from(entry.data) };
  }

  public remove(id: string): Promise<boolean> {
    return Promise.resolve(this.backups.delete(id));
  }

  /** Test utility — removes every stored backup. */
  public clear(): void {
    this.backups.clear();
  }
}
