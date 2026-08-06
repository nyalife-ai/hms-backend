/**
 * Prisma vital-sign repository — clinical.vital_signs (prisma.vitalSigns).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { VitalSignsQueryDto } from '../../dto';
import { VitalSign } from '../../domain/vital-sign.entity';
import { VitalSignName } from '../../domain/value-objects/vital-sign-name.vo';
import type {
  IVitalSignRepository,
  VitalSignPage,
} from '../../interfaces/vital-sign-repository.interface';

function toNum(
  v: { toNumber?: () => number } | number | string | null | undefined,
): number | null {
  if (v == null) return null;
  if (typeof v === 'object' && v?.toNumber) return v.toNumber();
  return Number(v);
}

@Injectable()
export class PrismaVitalSignRepository implements IVitalSignRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: VitalSign): Promise<VitalSign> {
    const existing = await this.prisma.vitalSigns.findFirst({
      where: { id: entity.getId() },
    });

    const vitalsData = {
      consultation_id: entity.getConsultationId() ?? null,
      blood_pressure: entity.getBloodPressure() ?? null,
      heart_rate: entity.getHeartRate() ?? null,
      respiratory_rate: entity.getRespiratoryRate() ?? null,
      temperature: entity.getTemperature() ?? null,
      weight: entity.getWeight() ?? null,
      height: entity.getHeight() ?? null,
      bmi: entity.getBmi() ?? null,
      pain_level: entity.getPainLevel() ?? null,
      oxygen_saturation: entity.getOxygenSaturation() ?? null,
      notes: entity.getNotes() ?? entity.getDescription() ?? null,
      measured_at: entity.getMeasuredAt() ?? undefined,
    };

    if (existing) {
      const row = await this.prisma.vitalSigns.update({
        where: { id: entity.getId() },
        data: vitalsData,
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.vitalSigns.create({
      data: {
        patient_id: entity.getPatientId(),
        recorded_by: entity.getRecordedBy(),
        ...vitalsData,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<VitalSign | null> {
    const row = await this.prisma.vitalSigns.findFirst({
      where: { id, is_voided: false },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<VitalSign[]> {
    const rows = await this.prisma.vitalSigns.findMany({
      where: { is_voided: false },
      orderBy: { measured_at: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.vitalSigns.count({
        where: { id, is_voided: false },
      })) > 0
    );
  }

  public async findMany(query: VitalSignsQueryDto): Promise<VitalSignPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      is_voided: false,
      ...(query.search
        ? {
            OR: [
              {
                blood_pressure: {
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
      this.prisma.vitalSigns.count({ where }),
      this.prisma.vitalSigns.findMany({
        where,
        skip,
        take: limit,
        orderBy: { measured_at: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.vitalSigns.update({
      where: { id },
      data: {
        is_voided: true,
        void_reason: 'Soft deleted',
        voided_at: new Date(),
      },
    });
  }

  protected toDomain(row: {
    id: string;
    patient_id: string;
    consultation_id: string | null;
    blood_pressure: string | null;
    heart_rate: number | null;
    respiratory_rate: number | null;
    temperature: { toNumber?: () => number } | number | string | null;
    weight: { toNumber?: () => number } | number | string | null;
    height: { toNumber?: () => number } | number | string | null;
    bmi: { toNumber?: () => number } | number | string | null;
    pain_level: number | null;
    oxygen_saturation: number | null;
    notes: string | null;
    measured_at: Date;
    recorded_by: string;
    is_voided: boolean;
    created_at: Date;
    updated_at: Date;
  }): VitalSign {
    const label =
      row.blood_pressure?.trim() ||
      (row.notes ? row.notes.slice(0, 255) : '') ||
      'Vitals';
    return VitalSign.reconstitute(
      row.id,
      {
        name: VitalSignName.create(label.slice(0, 255) || 'Vitals'),
        description: row.notes ?? undefined,
        patientId: row.patient_id,
        recordedBy: row.recorded_by,
        consultationId: row.consultation_id,
        bloodPressure: row.blood_pressure,
        heartRate: row.heart_rate,
        respiratoryRate: row.respiratory_rate,
        temperature: toNum(row.temperature),
        weight: toNum(row.weight),
        height: toNum(row.height),
        bmi: toNum(row.bmi),
        painLevel: row.pain_level,
        oxygenSaturation: row.oxygen_saturation,
        notes: row.notes,
        measuredAt: row.measured_at,
        isVoided: row.is_voided,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
