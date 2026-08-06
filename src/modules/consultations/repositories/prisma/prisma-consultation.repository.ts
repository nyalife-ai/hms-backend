/**
 * Prisma consultation repository — clinical.consultations (db.sql).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { ConsultationsQueryDto } from '../../dto';
import { Consultation } from '../../domain/consultation.entity';
import { ConsultationName } from '../../domain/value-objects/consultation-name.vo';
import type {
  IConsultationRepository,
  ConsultationPage,
} from '../../interfaces/consultation-repository.interface';

@Injectable()
export class PrismaConsultationRepository implements IConsultationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Consultation): Promise<Consultation> {
    const existing = await this.prisma.consultations.findFirst({
      where: { id: entity.getId(), deleted_at: null },
    });

    if (existing) {
      const row = await this.prisma.consultations.update({
        where: { id: entity.getId() },
        data: {
          appointment_id: entity.getAppointmentId() ?? null,
          chief_complaint: entity.getName().getValue(),
          history_present_illness: entity.getHistoryPresentIllness() ?? null,
          treatment_plan: entity.getTreatmentPlan() ?? null,
          notes: entity.getDescription() ?? null,
          status: entity.getStatus(),
          consultation_type: entity.getConsultationType(),
          priority: entity.getPriority(),
        },
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.consultations.create({
      data: {
        appointment_id: entity.getAppointmentId() ?? null,
        patient_id: entity.getPatientId(),
        doctor_id: entity.getDoctorId(),
        chief_complaint: entity.getName().getValue(),
        history_present_illness: entity.getHistoryPresentIllness() ?? null,
        treatment_plan: entity.getTreatmentPlan() ?? null,
        notes: entity.getDescription() ?? null,
        status: entity.getStatus(),
        consultation_type: entity.getConsultationType(),
        priority: entity.getPriority(),
        created_by: entity.getCreatedBy(),
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Consultation | null> {
    const row = await this.prisma.consultations.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Consultation[]> {
    const rows = await this.prisma.consultations.findMany({
      where: { deleted_at: null },
      orderBy: { consultation_date: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.consultations.count({
        where: { id, deleted_at: null },
      })) > 0
    );
  }

  public async findMany(
    query: ConsultationsQueryDto,
  ): Promise<ConsultationPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      deleted_at: null,
      ...(query.search
        ? {
            OR: [
              {
                chief_complaint: {
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
              {
                status: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                treatment_plan: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.consultations.count({ where }),
      this.prisma.consultations.findMany({
        where,
        skip,
        take: limit,
        orderBy: { consultation_date: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.consultations.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  protected toDomain(row: {
    id: string;
    appointment_id: string | null;
    patient_id: string;
    doctor_id: string;
    chief_complaint: string | null;
    history_present_illness: string | null;
    treatment_plan: string | null;
    notes: string | null;
    status: string;
    consultation_type: string;
    priority: string;
    created_by: string;
    created_at: Date;
    updated_at: Date;
  }): Consultation {
    const chief =
      row.chief_complaint?.trim() || `Consultation ${row.patient_id}`;
    return Consultation.reconstitute(
      row.id,
      {
        name: ConsultationName.create(chief.slice(0, 255)),
        description: row.notes ?? undefined,
        patientId: row.patient_id,
        doctorId: row.doctor_id,
        createdBy: row.created_by,
        appointmentId: row.appointment_id,
        status: row.status,
        consultationType: row.consultation_type,
        priority: row.priority,
        historyPresentIllness: row.history_present_illness,
        treatmentPlan: row.treatment_plan,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
