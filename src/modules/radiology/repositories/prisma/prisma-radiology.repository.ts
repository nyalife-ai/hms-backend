/**
 * Prisma radiology repository — radiology.requests (prisma.radiologyRequests).
 * name → request_number; description → clinical_indication.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { RadiologyQueryDto } from '../../dto';
import { Radiology } from '../../domain/radiology.entity';
import { RadiologyName } from '../../domain/value-objects/radiology-name.vo';
import type {
  IRadiologyRepository,
  RadiologyPage,
} from '../../interfaces/radiology-repository.interface';

@Injectable()
export class PrismaRadiologyRepository implements IRadiologyRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Radiology): Promise<Radiology> {
    const existing = await this.prisma.radiologyRequests.findFirst({
      where: { id: entity.getId() },
    });

    if (existing) {
      const row = await this.prisma.radiologyRequests.update({
        where: { id: entity.getId() },
        data: {
          request_number: entity.getName().getValue(),
          clinical_indication: entity.getDescription() ?? null,
          scan_type_id: entity.getScanTypeId(),
          requesting_doctor_id: entity.getRequestingDoctorId() ?? null,
          consultation_id: entity.getConsultationId() ?? null,
          priority: entity.getPriority(),
          status: entity.getStatus(),
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.radiologyRequests.create({
      data: {
        request_number: entity.getName().getValue(),
        patient_id: entity.getPatientId(),
        scan_type_id: entity.getScanTypeId(),
        requested_by: entity.getRequestedBy(),
        clinical_indication: entity.getDescription() ?? null,
        requesting_doctor_id: entity.getRequestingDoctorId() ?? null,
        consultation_id: entity.getConsultationId() ?? null,
        priority: entity.getPriority(),
        status: entity.getStatus(),
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Radiology | null> {
    const row = await this.prisma.radiologyRequests.findFirst({
      where: { id, NOT: { status: 'CANCELLED' } },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Radiology[]> {
    const rows = await this.prisma.radiologyRequests.findMany({
      where: { NOT: { status: 'CANCELLED' } },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.radiologyRequests.count({
        where: { id, NOT: { status: 'CANCELLED' } },
      })) > 0
    );
  }

  public async findMany(query: RadiologyQueryDto): Promise<RadiologyPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      NOT: { status: 'CANCELLED' },
      ...(query.search
        ? {
            OR: [
              {
                request_number: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                clinical_indication: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.radiologyRequests.count({ where }),
      this.prisma.radiologyRequests.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.radiologyRequests.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  protected toDomain(row: {
    id: string;
    request_number: string;
    patient_id: string;
    requesting_doctor_id: string | null;
    consultation_id: string | null;
    scan_type_id: string;
    clinical_indication: string | null;
    priority: string;
    status: string;
    requested_by: string;
    created_at: Date;
    updated_at: Date;
  }): Radiology {
    return Radiology.reconstitute(
      row.id,
      {
        name: RadiologyName.create(row.request_number),
        description: row.clinical_indication ?? undefined,
        patientId: row.patient_id,
        scanTypeId: row.scan_type_id,
        requestedBy: row.requested_by,
        requestingDoctorId: row.requesting_doctor_id,
        consultationId: row.consultation_id,
        priority: row.priority,
        status: row.status,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
