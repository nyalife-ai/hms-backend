import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  DatabaseAdapter,
  DatabaseHealth,
} from '../../../platform/database';
import type { PrismaClientLike } from '../../../platform/database/prisma/prisma-client.types';
import { maskError } from '../../configuration';
import type { DatabaseLogger } from '../database-logger.interface';

export type Now = () => number;

@Injectable()
export class PrismaService
  implements DatabaseAdapter, OnModuleInit, OnModuleDestroy
{
  private connected = false;
  private connection?: Promise<void>;
  private disconnection?: Promise<void>;

  public constructor(
    private readonly client: PrismaClientLike,
    private readonly environment = 'development',
    private readonly logger?: DatabaseLogger,
    private readonly now: Now = Date.now,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.connect();
  }

  public async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    if (this.connection === undefined) {
      this.connection = this.client
        .$connect()
        .then(
          () => {
            this.connected = true;
            if (this.environment !== 'production') {
              this.logger?.debug('Prisma connected');
            }
          },
          (error: unknown) => {
            this.logger?.error('Prisma connection failed', {
              error: maskError(error),
            });
            throw error;
          },
        )
        .finally(() => {
          this.connection = undefined;
        });
    }
    await this.connection;
  }

  public async disconnect(): Promise<void> {
    if (this.connection !== undefined) {
      try {
        await this.connection;
      } catch {
        return;
      }
    }
    if (!this.connected) {
      return;
    }
    if (this.disconnection === undefined) {
      this.disconnection = this.client.$disconnect().finally(() => {
        this.connected = false;
        this.disconnection = undefined;
      });
    }
    await this.disconnection;
  }

  public async transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    if (this.environment !== 'production') {
      this.logger?.debug('Prisma transaction started');
    }
    try {
      return await this.client.$transaction(async (tx) => work(tx));
    } catch (error: unknown) {
      this.logger?.warn('Prisma transaction rolled back', {
        error: maskError(error),
      });
      throw error;
    }
  }

  public async healthCheck(): Promise<DatabaseHealth> {
    const started = this.now();
    try {
      if (this.client.healthCheck !== undefined) {
        await this.client.healthCheck();
      } else if (this.client.queryRaw !== undefined) {
        await this.client.queryRaw('SELECT 1');
      }
      return {
        status: 'up',
        latencyMs: Math.max(0, this.now() - started),
        details: { provider: 'prisma' },
      };
    } catch (error: unknown) {
      const details = { provider: 'prisma', error: maskError(error) };
      this.logger?.error('Prisma health check failed', details);
      return {
        status: 'down',
        latencyMs: Math.max(0, this.now() - started),
        details,
      };
    }
  }

  public getClient(): PrismaClientLike {
    return this.client;
  }
}
