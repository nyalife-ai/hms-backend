/**
 * Prisma follow-up repository — clinical.follow_ups (prisma.followUps).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { FollowUpsQueryDto } from '../../dto';
import { FollowUp } from '../../domain/follow-up.entity';
import { FollowUpName } from '../../domain/value-objects/follow-up-name.vo';
import type {
  IFollowUpRepository,
  FollowUpPage,
} from '../../interfaces/follow-up-repository.interface';

@Injectable()
export class PrismaFollowUpRepository implements IFollowUpRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: FollowUp): Promise<FollowUp> {
    const existing = await this.prisma.followUps.findFirst({
      where: { id: entity.getId() },
    });

    if (existing) {
      const row = await this.prisma.followUps.update({
        where: { id: entity.getId() },
        data: {
          follow_up_date: entity.getFollowUpDate(),
          follow_up_type: entity.getFollowUpType() ?? null,
          reason: entity.getReason(),
          status: entity.getStatus(),
          notes: entity.getNotes() ?? entity.getDescription() ?? null,
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.followUps.create({
      data: {
        patient_id: entity.getPatientId(),
        consultation_id: entity.getConsultationId(),
        follow_up_date: entity.getFollowUpDate(),
        follow_up_type: entity.getFollowUpType() ?? null,
        reason: entity.getReason(),
        status: entity.getStatus(),
        notes: entity.getNotes() ?? entity.getDescription() ?? null,
        created_by: entity.getCreatedBy(),
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<FollowUp | null> {
    const row = await this.prisma.followUps.findFirst({
      where: { id, NOT: { status: 'CANCELLED' } },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<FollowUp[]> {
    const rows = await this.prisma.followUps.findMany({
      where: { NOT: { status: 'CANCELLED' } },
      orderBy: { follow_up_date: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.followUps.count({
        where: { id, NOT: { status: 'CANCELLED' } },
      })) > 0
    );
  }

  public async findMany(query: FollowUpsQueryDto): Promise<FollowUpPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      NOT: { status: 'CANCELLED' },
      ...(query.search
        ? {
            OR: [
              {
                reason: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                follow_up_type: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                notes: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.followUps.count({ where }),
      this.prisma.followUps.findMany({
        where,
        skip,
        take: limit,
        orderBy: { follow_up_date: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.followUps.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  protected toDomain(row: {
    id: string;
    patient_id: string;
    consultation_id: string;
    follow_up_date: Date;
    follow_up_type: string | null;
    reason: string;
    status: string;
    notes: string | null;
    created_by: string;
    created_at: Date;
    updated_at: Date;
  }): FollowUp {
    const label =
      row.follow_up_type?.trim() || row.reason.slice(0, 255) || 'Follow-up';
    return FollowUp.reconstitute(
      row.id,
      {
        name: FollowUpName.create(label),
        description: row.notes ?? undefined,
        patientId: row.patient_id,
        consultationId: row.consultation_id,
        followUpDate: row.follow_up_date,
        followUpType: row.follow_up_type,
        reason: row.reason,
        status: row.status,
        notes: row.notes,
        createdBy: row.created_by,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
