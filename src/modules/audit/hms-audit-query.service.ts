/**
 * Read API for core.audit_logs — full old/new + changed fields for admins.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { AuditLogsQueryDto } from './dto/audit-logs-query.dto';
import { getAuditRequestStore } from './audit-request.context';

export type AuditLogChangedField = {
  field: string;
  from: unknown;
  to: unknown;
};

export type AuditLogListItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  changedFieldCount: number;
  changedFieldsPreview: AuditLogChangedField[];
};

export type AuditLogDetail = AuditLogListItem & {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedFields: AuditLogChangedField[];
};

function extractChangedFields(
  newValues: unknown,
): AuditLogChangedField[] {
  if (!newValues || typeof newValues !== 'object' || Array.isArray(newValues)) {
    return [];
  }
  const raw = (newValues as Record<string, unknown>).__changedFields;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is AuditLogChangedField =>
      !!c &&
      typeof c === 'object' &&
      typeof (c as AuditLogChangedField).field === 'string',
  );
}

function stripMeta(
  values: unknown,
): Record<string, unknown> | null {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return null;
  }
  const { __changedFields: _c, ...rest } = values as Record<string, unknown>;
  return rest;
}

@Injectable()
export class HmsAuditQueryService {
  public constructor(private readonly prisma: PrismaService) {}

  public async list(query: AuditLogsQueryDto): Promise<{
    items: AuditLogListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogsWhereInput = {};
    if (query.userId) where.user_id = query.userId;
    if (query.action) where.action = query.action;
    if (query.entityType) {
      where.entity_type = {
        contains: query.entityType,
        mode: 'insensitive',
      };
    }
    if (query.from || query.to) {
      where.created_at = {};
      if (query.from) where.created_at.gte = new Date(query.from);
      if (query.to) where.created_at.lte = new Date(query.to);
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { entity_type: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
        { ip_address: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        ...(this.isUuid(q) ? [{ entity_id: q }, { id: q }, { user_id: q }] : []),
      ];
    }

    // Avoid auditing our own read path bookkeeping if any
    const store = getAuditRequestStore();
    if (store) store.skipDepth += 1;
    try {
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.auditLogs.count({ where }),
        this.prisma.auditLogs.findMany({
          where,
          skip,
          take: limit,
          orderBy: { created_at: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                core_profiles_user_id: {
                  select: { first_name: true, last_name: true },
                  take: 1,
                },
              },
            },
          },
        }),
      ]);

      return {
        items: rows.map((row) => this.toListItem(row)),
        total,
        page,
        limit,
      };
    } finally {
      if (store) store.skipDepth = Math.max(0, store.skipDepth - 1);
    }
  }

  public async findById(id: string): Promise<AuditLogDetail> {
    const store = getAuditRequestStore();
    if (store) store.skipDepth += 1;
    try {
      const row = await this.prisma.auditLogs.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              core_profiles_user_id: {
                select: { first_name: true, last_name: true },
                take: 1,
              },
            },
          },
        },
      });
      if (!row) throw new NotFoundException(`Audit log ${id} not found`);
      const base = this.toListItem(row);
      const changedFields = extractChangedFields(row.new_values);
      return {
        ...base,
        oldValues: stripMeta(row.old_values),
        newValues: stripMeta(row.new_values),
        changedFields,
      };
    } finally {
      if (store) store.skipDepth = Math.max(0, store.skipDepth - 1);
    }
  }

  public async listActors(): Promise<
    Array<{ id: string; email: string; name: string }>
  > {
    const store = getAuditRequestStore();
    if (store) store.skipDepth += 1;
    try {
      const grouped = await this.prisma.auditLogs.findMany({
        where: { user_id: { not: null } },
        distinct: ['user_id'],
        select: {
          user_id: true,
          user: {
            select: {
              id: true,
              email: true,
              core_profiles_user_id: {
                select: { first_name: true, last_name: true },
                take: 1,
              },
            },
          },
        },
        take: 200,
        orderBy: { created_at: 'desc' },
      });
      return grouped
        .filter((g) => g.user?.email)
        .map((g) => {
          const profile = g.user!.core_profiles_user_id[0];
          const email = g.user!.email as string;
          const name = profile
            ? `${profile.first_name} ${profile.last_name}`.trim()
            : email;
          return { id: g.user!.id, email, name };
        });
    } finally {
      if (store) store.skipDepth = Math.max(0, store.skipDepth - 1);
    }
  }

  private toListItem(row: {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    user_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
    new_values: unknown;
    user?: {
      id: string;
      email: string | null;
      core_profiles_user_id: Array<{
        first_name: string;
        last_name: string;
      }>;
    } | null;
  }): AuditLogListItem {
    const changedFields = extractChangedFields(row.new_values);
    const profile = row.user?.core_profiles_user_id?.[0];
    const userName = profile
      ? `${profile.first_name} ${profile.last_name}`.trim()
      : null;
    return {
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      userId: row.user_id,
      userEmail: row.user?.email ?? null,
      userName,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at.toISOString(),
      changedFieldCount: changedFields.length,
      changedFieldsPreview: changedFields.slice(0, 5),
    };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
