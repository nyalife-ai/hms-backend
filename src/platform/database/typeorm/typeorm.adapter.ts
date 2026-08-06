import { Injectable } from '@nestjs/common';
import type { DatabaseAdapter } from '../contracts/database-adapter.interface';
import type { DatabaseHealth } from '../contracts/database-health';
import type { DataSourceLike } from './typeorm-client.types';

@Injectable()
export class TypeOrmAdapter implements DatabaseAdapter {
  public constructor(private readonly dataSource: DataSourceLike) {}

  public async connect(): Promise<void> {
    if (this.dataSource.isInitialized !== true) {
      await this.dataSource.initialize();
    }
  }

  public async disconnect(): Promise<void> {
    if (this.dataSource.isInitialized !== false) {
      await this.dataSource.destroy();
    }
  }

  public async transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const result = await work(runner);
      await runner.commitTransaction();
      return result;
    } catch (error: unknown) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  public async healthCheck(): Promise<DatabaseHealth> {
    const started = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - started };
    } catch (error: unknown) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
