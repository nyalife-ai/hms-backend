import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  DatabaseAdapter,
  DatabaseHealth,
  DataSourceLike,
} from '../../../platform/database';
import { maskError } from '../../configuration';
import type { DatabaseLogger } from '../database-logger.interface';
import type { Now } from '../prisma/prisma.service';

export interface MigratingDataSource extends DataSourceLike {
  readonly runMigrations?: () => Promise<unknown>;
  readonly undoLastMigration?: () => Promise<unknown>;
}

@Injectable()
export class TypeOrmService
  implements DatabaseAdapter, OnModuleInit, OnModuleDestroy
{
  private readonly dataSource: MigratingDataSource;
  private readonly logger: DatabaseLogger | undefined;
  private readonly now: Now;
  private initialized = false;
  private initialization?: Promise<void>;
  private destruction?: Promise<void>;

  public constructor(
    dataSource: MigratingDataSource,
    logger?: DatabaseLogger,
    now: Now = Date.now,
  ) {
    this.dataSource = dataSource;
    this.logger = logger;
    this.now = now;
  }

  public async onModuleInit(): Promise<void> {
    await this.connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  public async connect(): Promise<void> {
    if (this.initialized || this.dataSource.isInitialized === true) {
      this.initialized = true;
      return;
    }
    if (this.initialization === undefined) {
      this.initialization = this.dataSource
        .initialize()
        .then(
          () => {
            this.initialized = true;
          },
          (error: unknown) => {
            this.logger?.error('TypeORM connection failed', {
              error: maskError(error),
            });
            throw error;
          },
        )
        .finally(() => {
          this.initialization = undefined;
        });
    }
    await this.initialization;
  }

  public async disconnect(): Promise<void> {
    if (this.initialization !== undefined) {
      try {
        await this.initialization;
      } catch {
        return;
      }
    }
    if (!this.initialized && this.dataSource.isInitialized !== true) {
      return;
    }
    if (this.destruction === undefined) {
      this.destruction = this.dataSource.destroy().finally(() => {
        this.initialized = false;
        this.destruction = undefined;
      });
    }
    await this.destruction;
  }

  public async transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      try {
        const result = await work(runner);
        await runner.commitTransaction();
        return result;
      } catch (error: unknown) {
        try {
          await runner.rollbackTransaction();
        } catch (rollbackError: unknown) {
          this.logger?.error('TypeORM rollback failed', {
            error: maskError(rollbackError),
          });
        }
        throw error;
      }
    } finally {
      await runner.release();
    }
  }

  public async healthCheck(): Promise<DatabaseHealth> {
    const started = this.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'up',
        latencyMs: Math.max(0, this.now() - started),
        details: { provider: 'typeorm' },
      };
    } catch (error: unknown) {
      const details = { provider: 'typeorm', error: maskError(error) };
      this.logger?.error('TypeORM health check failed', details);
      return {
        status: 'down',
        latencyMs: Math.max(0, this.now() - started),
        details,
      };
    }
  }

  public async runMigrations(): Promise<void> {
    if (this.dataSource.runMigrations === undefined) {
      throw new Error('TypeORM datasource does not support migrations');
    }
    await this.dataSource.runMigrations();
  }

  public async undoLastMigration(): Promise<void> {
    if (this.dataSource.undoLastMigration === undefined) {
      throw new Error('TypeORM datasource does not support migration reverts');
    }
    await this.dataSource.undoLastMigration();
  }

  public getDataSource(): MigratingDataSource {
    return this.dataSource;
  }
}
