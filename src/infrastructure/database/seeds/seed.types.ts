import type { DatabaseSeed } from '../../../platform/database';

export type SeedUnit = DatabaseSeed &
  Readonly<{
    idempotent?: boolean;
    shouldRun?: () => boolean | Promise<boolean>;
  }>;

export type SeedResult = Readonly<{
  name: string;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
}>;

export type SeedTransaction = <T>(work: () => Promise<T>) => Promise<T>;
