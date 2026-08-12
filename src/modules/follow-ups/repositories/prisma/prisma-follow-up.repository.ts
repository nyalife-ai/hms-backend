/**
 * Prisma follow-up repository — clinical.follow_ups (prisma.followUps).
 */

import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { FollowUpsQueryDto } from '../../dto';
import { FollowUp } from '../../domain/follow-up.entity';
import { FollowUpName } from '../../domain/value-objects/follow-up-name.vo';
import { FollowUpStatus } from '../../enums/follow-up-status.enum';
import type {
  IFollowUpRepository,
  FollowUpPage,
  FollowUpListScope,
  FollowUpSummaryCounts,
} from '../../interfaces/follow-up-repository.interface';

const detailInclude = {
  patient: {
    include: {
      user: { include: { core_profiles_user_id: true } },
    },
  },
  consultation: {
    include: {
      doctor: {
        include: {
          user: { include: { core_profiles_user_id: true } },
        },
      },
    },
  },
} satisfies Prisma.FollowUpsInclude;

type FollowUpRow = Prisma.FollowUpsGetPayload<{ include: typeof detailInclude }>;

function profileName(
  profiles: Array<{ first_name: string; last_name: string }> | undefined,
): string {
  const p = profiles?.[0];
  return p ? `${p.first_name} ${p.last_name}`.trim() : '';
}

function startOfMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfNextMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function parseDateOnly(value: string): Date {
  const [y, m, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

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
        include: detailInclude,
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
      include: detailInclude,
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<FollowUp | null> {
    return this.findByIdScoped(id);
  }

  public async findByIdScoped(
    id: string,
    scope?: FollowUpListScope,
  ): Promise<FollowUp | null> {
    const row = await this.prisma.followUps.findFirst({
      where: {
        id,
        ...this.scopeWhere(scope),
      },
      include: detailInclude,
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<FollowUp[]> {
    const rows = await this.prisma.followUps.findMany({
      where: { NOT: { status: FollowUpStatus.CANCELLED } },
      include: detailInclude,
      orderBy: { follow_up_date: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.followUps.count({
        where: { id, NOT: { status: FollowUpStatus.CANCELLED } },
      })) > 0
    );
  }

  public async findMany(
    query: FollowUpsQueryDto,
    scope?: FollowUpListScope,
  ): Promise<FollowUpPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 500);
    const skip = (page - 1) * limit;
    const where = this.buildListWhere(query, scope);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.followUps.count({ where }),
      this.prisma.followUps.findMany({
        where,
        skip,
        take: limit,
        orderBy: { follow_up_date: 'desc' },
        include: detailInclude,
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async getSummary(
    scope?: FollowUpListScope,
  ): Promise<FollowUpSummaryCounts> {
    const base = this.scopeWhere(scope);
    const now = new Date();
    const monthStart = startOfMonth(now);
    const nextMonth = startOfNextMonth(now);
    const today = startOfUtcDay(now);
    const in7 = addUtcDays(today, 7);

    const [scheduledThisMonth, completedThisMonth, dueWithin7Days, overdue] =
      await this.prisma.$transaction([
        this.prisma.followUps.count({
          where: {
            ...base,
            status: FollowUpStatus.SCHEDULED,
            follow_up_date: { gte: monthStart, lt: nextMonth },
          },
        }),
        this.prisma.followUps.count({
          where: {
            ...base,
            status: FollowUpStatus.COMPLETED,
            follow_up_date: { gte: monthStart, lt: nextMonth },
          },
        }),
        this.prisma.followUps.count({
          where: {
            ...base,
            status: FollowUpStatus.SCHEDULED,
            follow_up_date: { gte: today, lte: in7 },
          },
        }),
        this.prisma.followUps.count({
          where: {
            ...base,
            status: FollowUpStatus.SCHEDULED,
            follow_up_date: { lt: today },
          },
        }),
      ]);

    return {
      scheduledThisMonth,
      completedThisMonth,
      dueWithin7Days,
      overdue,
    };
  }

  public async findByConsultationAndDate(
    consultationId: string,
    followUpDate: Date,
  ): Promise<FollowUp | null> {
    const day = startOfUtcDay(followUpDate);
    const next = addUtcDays(day, 1);
    const row = await this.prisma.followUps.findFirst({
      where: {
        consultation_id: consultationId,
        follow_up_date: { gte: day, lt: next },
      },
      include: detailInclude,
    });
    return row ? this.toDomain(row) : null;
  }

  public async findLatestConsultationId(
    patientId: string,
  ): Promise<string | null> {
    const row = await this.prisma.consultations.findFirst({
      where: { patient_id: patientId, deleted_at: null },
      orderBy: { consultation_date: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.followUps.update({
      where: { id },
      data: { status: FollowUpStatus.CANCELLED },
    });
  }

  private scopeWhere(scope?: FollowUpListScope): Prisma.FollowUpsWhereInput {
    if (!scope?.doctorStaffId) return {};
    return {
      consultation: { doctor_id: scope.doctorStaffId, deleted_at: null },
    };
  }

  private buildListWhere(
    query: FollowUpsQueryDto,
    scope?: FollowUpListScope,
  ): Prisma.FollowUpsWhereInput {
    const and: Prisma.FollowUpsWhereInput[] = [];
    const scoped = this.scopeWhere(scope);
    if (Object.keys(scoped).length) and.push(scoped);

    if (query.status) {
      and.push({ status: query.status });
    } else {
      and.push({ NOT: { status: FollowUpStatus.CANCELLED } });
    }

    if (query.doctorId) {
      and.push({
        consultation: { doctor_id: query.doctorId, deleted_at: null },
      });
    }

    if (query.from || query.to) {
      const follow_up_date: Prisma.DateTimeFilter = {};
      if (query.from) follow_up_date.gte = parseDateOnly(query.from);
      if (query.to) {
        // inclusive end-of-day via next day exclusive
        follow_up_date.lt = addUtcDays(parseDateOnly(query.to), 1);
      }
      and.push({ follow_up_date });
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      and.push({
        OR: [
          { reason: { contains: term, mode: 'insensitive' } },
          {
            patient: {
              patient_number: { contains: term, mode: 'insensitive' },
            },
          },
          {
            patient: {
              user: {
                core_profiles_user_id: {
                  some: {
                    OR: [
                      { first_name: { contains: term, mode: 'insensitive' } },
                      { last_name: { contains: term, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            },
          },
        ],
      });
    }

    return and.length === 1 ? and[0]! : { AND: and };
  }

  protected toDomain(row: FollowUpRow): FollowUp {
    const label =
      row.follow_up_type?.trim() || row.reason.slice(0, 255) || 'Follow-up';
    const patientName =
      profileName(row.patient?.user?.core_profiles_user_id) ||
      row.patient?.patient_number ||
      '';
    const doctorName =
      profileName(row.consultation?.doctor?.user?.core_profiles_user_id) || '';

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
        display: {
          patientName,
          patientMrn: row.patient?.patient_number ?? '',
          appointmentId: row.consultation?.appointment_id ?? null,
          doctorId: row.consultation?.doctor_id ?? '',
          doctorName: doctorName ? `Dr. ${doctorName}` : '',
        },
      },
      row.created_at,
      row.updated_at,
    );
  }
}
