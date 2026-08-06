import type { DatabaseHealth } from './database-health';

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T>;
  healthCheck(): Promise<DatabaseHealth>;
}
