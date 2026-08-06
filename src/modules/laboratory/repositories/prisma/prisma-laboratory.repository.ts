/**
 * Prisma laboratory repository — laboratory.requests (LaboratoryRequests).
 * Prefer LabJourneyUseCase (/laboratory/requests) for the full request→sample→result flow.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { LaboratoryQueryDto } from '../../dto';
import { Laboratory } from '../../domain/laboratory.entity';
import { LaboratoryName } from '../../domain/value-objects/laboratory-name.vo';
import type {
  ILaboratoryRepository,
  LaboratoryPage,
} from '../../interfaces/laboratory-repository.interface';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaLaboratoryRepository implements ILaboratoryRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Laboratory): Promise<Laboratory> {
    const patientId = entity.getPatientId();
    const requestedBy = entity.getRequestedBy();
    if (!patientId || !requestedBy) {
      throw new Error(
        'Use POST /laboratory/requests (LabJourneyUseCase) to create lab requests',
      );
    }

    const id = entity.getId();
    const existing =
      UUID_RE.test(id)
        ? await this.prisma.laboratoryRequests.findFirst({ where: { id } })
        : null;

    if (existing) {
      const row = await this.prisma.laboratoryRequests.update({
        where: { id },
        data: {
          notes: entity.getDescription() ?? null,
          request_number: entity.getName().getValue(),
        },
      });
      return this.toDomain(row);
    }

    const seq = await this.prisma.laboratoryRequests.count();
    const requestNumber =
      entity.getName().getValue() ||
      `LAB-${new Date().getFullYear()}-${String(seq + 1).padStart(4, '0')}`;

    const row = await this.prisma.laboratoryRequests.create({
      data: {
        request_number: requestNumber,
        patient_id: patientId,
        requested_by: requestedBy,
        notes: entity.getDescription() ?? null,
        status: 'PENDING',
        priority: 'NORMAL',
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Laboratory | null> {
    const row = await this.prisma.laboratoryRequests.findFirst({
      where: { id },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Laboratory[]> {
    const rows = await this.prisma.laboratoryRequests.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: { request_date: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.prisma.laboratoryRequests.count({ where: { id } })) > 0;
  }

  public async findMany(query: LaboratoryQueryDto): Promise<LaboratoryPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.laboratoryRequests.count(),
      this.prisma.laboratoryRequests.findMany({
        skip,
        take: limit,
        orderBy: { request_date: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.laboratoryRequests.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  protected toDomain(row: {
    id: string;
    request_number: string | null;
    notes: string | null;
    status: string;
    patient_id: string;
    requested_by: string;
    created_at: Date;
    updated_at: Date;
  }): Laboratory {
    const label =
      row.request_number?.trim() || `Lab ${row.id.slice(0, 8)}`;
    return Laboratory.reconstitute(
      row.id,
      {
        name: LaboratoryName.create(label.slice(0, 255) || 'Lab request'),
        description: row.notes ?? row.status,
        patientId: row.patient_id,
        requestedBy: row.requested_by,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
