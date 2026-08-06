/**
 * Prisma audit repository — core.audit_logs (read + optional append).
 * Soft-delete is not supported; prefer AuditService for appends.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { AuditQueryDto } from '../../dto';
import { Audit } from '../../domain/audit.entity';
import { AuditName } from '../../domain/value-objects/audit-name.vo';
import type {
  IAuditRepository,
  AuditPage,
} from '../../interfaces/audit-repository.interface';

@Injectable()
export class PrismaAuditRepository implements IAuditRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Audit): Promise<Audit> {
    const existing = await this.prisma.auditLogs.findFirst({
      where: { id: entity.getId() },
    });
    if (existing) {
      throw new Error('Audit logs are append-only via AuditService');
    }

    const action = entity.getAction() ?? entity.getName().getValue();
    const entityType = entity.getEntityType();
    const entityId = entity.getEntityId();

    if (!entityType || !entityId) {
      throw new Error('Audit logs are append-only via AuditService');
    }

    const row = await this.prisma.auditLogs.create({
      data: {
        action: action.slice(0, 20),
        entity_type: entityType.slice(0, 100),
        entity_id: entityId,
        user_id: entity.getUserId() ?? null,
        new_values: entity.getDescription()
          ? { description: entity.getDescription() }
          : undefined,
      },
    });
    return this.toDomain(row);
  }

  public async delete(_id: string): Promise<void> {
    throw new Error('Audit logs cannot be deleted');
  }

  public async findById(id: string): Promise<Audit | null> {
    const row = await this.prisma.auditLogs.findFirst({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Audit[]> {
    const rows = await this.prisma.auditLogs.findMany({
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.prisma.auditLogs.count({ where: { id } })) > 0;
  }

  public async findMany(query: AuditQueryDto): Promise<AuditPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLogs.count(),
      this.prisma.auditLogs.findMany({
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(_id: string): Promise<void> {
    throw new Error('Audit logs cannot be soft-deleted');
  }

  protected toDomain(row: {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    user_id: string | null;
    created_at: Date;
  }): Audit {
    return Audit.reconstitute(
      row.id,
      {
        name: AuditName.create(row.action.slice(0, 255) || 'audit'),
        description: `${row.entity_type}:${row.entity_id}`,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        userId: row.user_id ?? undefined,
      },
      row.created_at,
      row.created_at,
    );
  }
}
