import type {
  BackupDescriptor,
  CreateBackupInput,
  RestoreBackupResult,
} from './backup.types';

/**
 * Backup/restore capability port. Infrastructure adapters (S3 snapshots,
 * database dump tooling, etc.) implement this; {@link InMemoryBackupProvider}
 * is the in-process reference implementation for tests.
 */
export interface BackupProvider {
  readonly name: string;
  create(input: CreateBackupInput): Promise<BackupDescriptor>;
  list(): Promise<BackupDescriptor[]>;
  get(id: string): Promise<BackupDescriptor | undefined>;
  restore(id: string): Promise<RestoreBackupResult>;
  remove(id: string): Promise<boolean>;
}
