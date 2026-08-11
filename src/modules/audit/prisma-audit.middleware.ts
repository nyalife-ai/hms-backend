/**
 * Prisma $use middleware — audit every CREATE / UPDATE / DELETE with old→new.
 */

import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { Prisma } from '../../generated/prisma';
import type { PrismaService } from '../../database/prisma/prisma.service';
import { getAuditRequestStore } from './audit-request.context';
import { diffAuditFields, maskAuditRecord } from './audit-masking';
import type { AuditAction } from './hms-audit.writer';

const SKIP_MODELS = new Set(['AuditLogs', 'AccessLogs']);
const WRITE_ACTIONS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

const NIL_UUID = '00000000-0000-4000-8000-000000000000';
const logger = new Logger('PrismaAuditMiddleware');

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function entityIdFrom(row: Record<string, unknown> | null | undefined): string {
  if (!row) return NIL_UUID;
  if (isUuid(row.id)) return row.id;
  // Deterministic fallback so non-UUID PKs still land in audit_logs.entity_id
  const raw = String(row.id ?? JSON.stringify(row)).slice(0, 200);
  const hex = createHash('sha256').update(raw).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function delegate(prisma: PrismaService, model: string): any {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (prisma as any)[key];
}

async function writeAudit(
  prisma: PrismaService,
  input: {
    action: AuditAction;
    entityType: string;
    entityId: string;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
  },
): Promise<void> {
  const store = getAuditRequestStore();
  if (store) store.skipDepth += 1;
  try {
    const oldMasked = maskAuditRecord(input.oldValues);
    const newMasked = maskAuditRecord(input.newValues);
    const changes = diffAuditFields(oldMasked, newMasked);
    await prisma.auditLogs.create({
      data: {
        user_id: store?.userId || null,
        action: input.action,
        entity_type: input.entityType.slice(0, 100),
        entity_id: input.entityId,
        old_values: (oldMasked ?? undefined) as Prisma.InputJsonValue | undefined,
        new_values: {
          ...(newMasked ?? {}),
          __changedFields: changes,
        } as Prisma.InputJsonValue,
        ip_address: store?.ipAddress?.slice(0, 45) || null,
        user_agent: store?.userAgent || null,
      },
    });
  } catch (err) {
    logger.warn(
      `auto audit failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    if (store) store.skipDepth = Math.max(0, store.skipDepth - 1);
  }
}

export function registerPrismaAuditMiddleware(prisma: PrismaService): void {
  prisma.$use(async (params, next) => {
    const store = getAuditRequestStore();
    if (
      !params.model ||
      SKIP_MODELS.has(params.model) ||
      !WRITE_ACTIONS.has(params.action) ||
      (store?.skipDepth ?? 0) > 0 ||
      !prisma.isConnected
    ) {
      return next(params);
    }

    const model = params.model;
    const d = delegate(prisma, model);

    if (params.action === 'create') {
      const result = await next(params);
      await writeAudit(prisma, {
        action: 'CREATE',
        entityType: model,
        entityId: entityIdFrom(asRecord(result)),
        oldValues: null,
        newValues: asRecord(result),
      });
      return result;
    }

    if (params.action === 'createMany') {
      const result = await next(params);
      await writeAudit(prisma, {
        action: 'CREATE',
        entityType: model,
        entityId: randomUUID(),
        oldValues: null,
        newValues: {
          count: (result as { count?: number })?.count,
          data: params.args?.data,
        },
      });
      return result;
    }

    if (params.action === 'update') {
      let oldRow: Record<string, unknown> | null = null;
      try {
        oldRow = asRecord(await d.findUnique({ where: params.args.where }));
      } catch {
        oldRow = null;
      }
      const result = await next(params);
      const newRow = asRecord(result) ?? {
        ...oldRow,
        ...(params.args?.data ?? {}),
      };
      await writeAudit(prisma, {
        action: 'UPDATE',
        entityType: model,
        entityId: entityIdFrom(newRow ?? oldRow),
        oldValues: oldRow,
        newValues: newRow,
      });
      return result;
    }

    if (params.action === 'upsert') {
      let oldRow: Record<string, unknown> | null = null;
      try {
        oldRow = asRecord(await d.findUnique({ where: params.args.where }));
      } catch {
        oldRow = null;
      }
      const result = await next(params);
      const newRow = asRecord(result);
      await writeAudit(prisma, {
        action: oldRow ? 'UPDATE' : 'CREATE',
        entityType: model,
        entityId: entityIdFrom(newRow ?? oldRow),
        oldValues: oldRow,
        newValues: newRow,
      });
      return result;
    }

    if (params.action === 'delete') {
      let oldRow: Record<string, unknown> | null = null;
      try {
        oldRow = asRecord(await d.findUnique({ where: params.args.where }));
      } catch {
        oldRow = null;
      }
      const result = await next(params);
      await writeAudit(prisma, {
        action: 'DELETE',
        entityType: model,
        entityId: entityIdFrom(oldRow ?? asRecord(result)),
        oldValues: oldRow ?? asRecord(result),
        newValues: null,
      });
      return result;
    }

    if (params.action === 'updateMany') {
      let before: Record<string, unknown>[] = [];
      try {
        before = (await d.findMany({
          where: params.args.where,
          take: 50,
        })) as Record<string, unknown>[];
      } catch {
        before = [];
      }
      const result = await next(params);
      for (const oldRow of before) {
        await writeAudit(prisma, {
          action: 'UPDATE',
          entityType: model,
          entityId: entityIdFrom(oldRow),
          oldValues: oldRow,
          newValues: { ...oldRow, ...(params.args?.data ?? {}) },
        });
      }
      if (!before.length) {
        await writeAudit(prisma, {
          action: 'UPDATE',
          entityType: model,
          entityId: randomUUID(),
          oldValues: null,
          newValues: {
            where: params.args?.where,
            data: params.args?.data,
            count: (result as { count?: number })?.count,
          },
        });
      }
      return result;
    }

    if (params.action === 'deleteMany') {
      let before: Record<string, unknown>[] = [];
      try {
        before = (await d.findMany({
          where: params.args.where,
          take: 50,
        })) as Record<string, unknown>[];
      } catch {
        before = [];
      }
      const result = await next(params);
      for (const oldRow of before) {
        await writeAudit(prisma, {
          action: 'DELETE',
          entityType: model,
          entityId: entityIdFrom(oldRow),
          oldValues: oldRow,
          newValues: null,
        });
      }
      if (!before.length) {
        await writeAudit(prisma, {
          action: 'DELETE',
          entityType: model,
          entityId: randomUUID(),
          oldValues: { where: params.args?.where },
          newValues: null,
        });
      }
      return result;
    }

    return next(params);
  });
}
