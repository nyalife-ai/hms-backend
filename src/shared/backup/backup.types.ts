export type BackupStatus = 'pending' | 'completed' | 'failed';

export interface BackupDescriptor {
  readonly id: string;
  readonly label: string;
  readonly createdAt: Date;
  readonly status: BackupStatus;
  readonly sizeBytes?: number;
  readonly error?: string;
}

export interface CreateBackupInput {
  readonly label: string;
  readonly data: Buffer;
}

export interface RestoreBackupResult {
  readonly id: string;
  readonly data: Buffer;
}
