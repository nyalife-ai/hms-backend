/**
 * Internal audit / access logging — writes core.audit_logs + core.access_logs.
 * Domain modules must call this; clients cannot bypass by omitting an audit HTTP call.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma/prisma.service';
import { getAuditRequestStore } from './audit-request.context';
import { diffAuditFields, maskAuditRecord } from './audit-masking';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

export type RecordMutationInput = {
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type RecordAccessInput = {
  userId: string;
  patientId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class HmsAuditWriter {
  private readonly logger = new Logger(HmsAuditWriter.name);

  public constructor(private readonly prisma: PrismaService) {}

  public async recordMutation(input: RecordMutationInput): Promise<void> {
    if (!this.prisma.isConnected) return;
    const store = getAuditRequestStore();
    if (store) store.skipDepth += 1;
    try {
      const oldMasked = maskAuditRecord(input.oldValues ?? null);
      const newMasked = maskAuditRecord(input.newValues ?? null);
      const changes = diffAuditFields(oldMasked, newMasked);
      await this.prisma.auditLogs.create({
        data: {
          user_id: input.userId || store?.userId || null,
          action: input.action,
          entity_type: input.entityType.slice(0, 100),
          entity_id: input.entityId,
          old_values: (oldMasked ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          new_values: {
            ...(newMasked ?? {}),
            __changedFields: changes,
          } as Prisma.InputJsonValue,
          ip_address:
            (input.ipAddress || store?.ipAddress)?.slice(0, 45) || null,
          user_agent: input.userAgent || store?.userAgent || null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `audit_logs write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (store) store.skipDepth = Math.max(0, store.skipDepth - 1);
    }
  }

  public async recordAccess(input: RecordAccessInput): Promise<void> {
    if (!this.prisma.isConnected) return;
    try {
      await this.prisma.accessLogs.create({
        data: {
          user_id: input.userId,
          patient_id: input.patientId || null,
          entity_type: input.entityType?.slice(0, 100) || null,
          entity_id: input.entityId || null,
          ip_address: input.ipAddress?.slice(0, 45) || null,
          user_agent: input.userAgent || null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `access_logs write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
