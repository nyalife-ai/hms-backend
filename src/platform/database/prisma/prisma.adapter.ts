import { Injectable } from '@nestjs/common';
import type { DatabaseAdapter } from '../contracts/database-adapter.interface';
import type { DatabaseHealth } from '../contracts/database-health';
import type { PrismaClientLike } from './prisma-client.types';

@Injectable()
export class PrismaAdapter implements DatabaseAdapter {
  public constructor(private readonly client: PrismaClientLike) {}

  public async connect(): Promise<void> {
    await this.client.$connect();
  }

  public async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }

  public transaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return this.client.$transaction(work);
  }

  public async healthCheck(): Promise<DatabaseHealth> {
    const started = Date.now();
    try {
      await this.probe();
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

  private async probe(): Promise<void> {
    if (this.client.healthCheck !== undefined) {
      await this.client.healthCheck();
      return;
    }
    if (this.client.queryRaw !== undefined) {
      await this.client.queryRaw('SELECT 1');
      return;
    }
    await this.client.$connect();
  }
}
