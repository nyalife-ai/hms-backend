/**
 * Import session store — Redis with TTL; falls back to memory if Redis is unavailable.
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import type {
  BulkImportNormalizedRow,
  BulkImportRowIssue,
} from '../resources/bulk-import-resource';

export type ImportSession = {
  readonly id: string;
  readonly resourceKey: string;
  readonly actorUserId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly totalRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly warningRows: number;
  readonly errors: BulkImportRowIssue[];
  readonly warnings: BulkImportRowIssue[];
  readonly rows: BulkImportNormalizedRow[];
};

const TTL_SEC = 30 * 60;
const KEY_PREFIX = 'bulk-import:session:';

@Injectable()
export class ImportSessionStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportSessionStore.name);
  private readonly memory = new Map<string, ImportSession>();
  private redis: Redis | null = null;
  private useRedis = false;

  public constructor(private readonly config: ConfigService) {}

  public async onModuleInit(): Promise<void> {
    try {
      const host = this.config.get<string>('redis.host') || '127.0.0.1';
      const port = this.config.get<number>('redis.port') || 6379;
      const passwordRaw = this.config.get<string>('redis.password');
      const password =
        passwordRaw && passwordRaw.trim().length > 0
          ? passwordRaw.trim()
          : undefined;
      this.redis = new Redis({
        host,
        port,
        ...(password ? { password } : {}),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: true,
        lazyConnect: true,
        retryStrategy: (times) =>
          times > 3 ? null : Math.min(times * 200, 1000),
      });
      this.redis.on('error', (err) => {
        this.logger.warn(`Redis session store error: ${err.message}`);
        this.useRedis = false;
      });
      await this.redis.connect();
      await this.redis.ping();
      this.useRedis = true;
      this.logger.log(`Bulk import sessions using Redis at ${host}:${port}`);
    } catch (err) {
      this.useRedis = false;
      this.logger.warn(
        `Bulk import sessions falling back to memory: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      try {
        await this.redis?.quit();
      } catch {
        // ignore
      }
      this.redis = null;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    try {
      await this.redis?.quit();
    } catch {
      // ignore
    }
  }

  public async create(input: {
    resourceKey: string;
    actorUserId: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
    errors: BulkImportRowIssue[];
    warnings: BulkImportRowIssue[];
    rows: BulkImportNormalizedRow[];
  }): Promise<ImportSession> {
    const now = Date.now();
    const session: ImportSession = {
      id: randomUUID(),
      resourceKey: input.resourceKey,
      actorUserId: input.actorUserId,
      createdAt: now,
      expiresAt: now + TTL_SEC * 1000,
      totalRows: input.totalRows,
      validRows: input.validRows,
      invalidRows: input.invalidRows,
      warningRows: input.warningRows,
      errors: input.errors,
      warnings: input.warnings,
      rows: input.rows,
    };

    if (this.useRedis && this.redis) {
      try {
        await this.redis.set(
          KEY_PREFIX + session.id,
          JSON.stringify(session),
          'EX',
          TTL_SEC,
        );
        return session;
      } catch (err) {
        this.logger.warn(
          `Redis set failed, using memory: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        this.useRedis = false;
      }
    }

    this.purgeMemory();
    this.memory.set(session.id, session);
    return session;
  }

  public async get(id: string): Promise<ImportSession | undefined> {
    if (this.useRedis && this.redis) {
      try {
        const raw = await this.redis.get(KEY_PREFIX + id);
        if (!raw) return undefined;
        return JSON.parse(raw) as ImportSession;
      } catch (err) {
        this.logger.warn(
          `Redis get failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.useRedis = false;
      }
    }
    this.purgeMemory();
    const session = this.memory.get(id);
    if (!session) return undefined;
    if (session.expiresAt < Date.now()) {
      this.memory.delete(id);
      return undefined;
    }
    return session;
  }

  public async delete(id: string): Promise<void> {
    if (this.useRedis && this.redis) {
      try {
        await this.redis.del(KEY_PREFIX + id);
      } catch {
        // ignore
      }
    }
    this.memory.delete(id);
  }

  private purgeMemory(): void {
    const now = Date.now();
    for (const [id, session] of this.memory) {
      if (session.expiresAt < now) this.memory.delete(id);
    }
  }
}
