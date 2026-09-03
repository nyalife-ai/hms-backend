import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import { registerPrismaAuditMiddleware } from '../../modules/audit/prisma-audit.middleware';
import { datasourceUrlWithPool } from './prisma-datasource-url';

/**
 * Nest-managed Prisma client for the NyaLife multi-schema HMS database.
 *
 * Prefer Session-mode pooler (port 5432 on `*.pooler.supabase.com`) for the
 * Nest `DATABASE_URL`, with a low `connection_limit` (capped in
 * {@link datasourceUrlWithPool}). Keep Transaction-mode (6543) only if you
 * must, and always pair it with `pgbouncer=true` + `connection_limit=1`.
 * `DIRECT_URL` is for `prisma migrate` / `db push`.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  /** True after a successful $connect — HMS services can fall back when false. */
  isConnected = false;

  constructor() {
    const url = datasourceUrlWithPool(process.env.DATABASE_URL);
    super({
      datasources: url ? { db: { url } } : undefined,
      log:
        process.env.NODE_ENV !== 'production'
          ? ['warn', 'error']
          : ['error'],
    });
    if (url) {
      try {
        const parsed = new URL(url);
        this.logger.log(
          `Prisma datasource pool: host=${parsed.hostname} port=${parsed.port || '5432'} ` +
            `connection_limit=${parsed.searchParams.get('connection_limit') || 'default'} ` +
            `pgbouncer=${parsed.searchParams.get('pgbouncer') || 'false'}`,
        );
      } catch {
        /* ignore */
      }
    }
    // Register before any queries so every mutation is audited.
    registerPrismaAuditMiddleware(this);
  }

  async onModuleInit(): Promise<void> {
    const attempts = 3;
    let lastError: unknown;
    for (let i = 1; i <= attempts; i += 1) {
      try {
        await this.$connect();
        this.isConnected = true;
        this.logger.log('Prisma connected (Supabase / PostgreSQL)');
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Prisma connect attempt ${i}/${attempts} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await new Promise((r) => setTimeout(r, 500 * i));
      }
    }

    const optional =
      process.env.DATABASE_OPTIONAL === 'true' ||
      process.env.DATABASE_OPTIONAL === '1';
    this.logger.error('Prisma connection failed', lastError as Error);
    if (optional) {
      this.logger.warn(
        'DATABASE_OPTIONAL=true — API continues; HMS auth falls back to seeded in-memory users until migrate succeeds',
      );
      return;
    }
    throw lastError;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.$disconnect();
      this.isConnected = false;
      this.logger.log('Prisma disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Prisma', error as Error);
    }
  }
}
