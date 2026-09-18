/**
 * Prisma appointment repository — clinical.appointments (db.sql).
 */

import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { AppointmentsQueryDto } from '../../dto';
import { Appointment } from '../../domain/appointment.entity';
import { AppointmentName } from '../../domain/value-objects/appointment-name.vo';
import type {
  IAppointmentRepository,
  AppointmentPage,
} from '../../interfaces/appointment-repository.interface';

@Injectable()
export class PrismaAppointmentRepository implements IAppointmentRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Appointment): Promise<Appointment> {
    const existing = await this.prisma.appointments.findFirst({
      where: { id: entity.getId(), deleted_at: null },
    });

    if (existing) {
      const scheduleChanged =
        existing.doctor_id !== entity.getDoctorId() ||
        existing.appointment_date.getTime() !==
          entity.getAppointmentDate().getTime() ||
        existing.start_time.getTime() !== entity.getStartTime().getTime() ||
        existing.end_time.getTime() !== entity.getEndTime().getTime();
      return this.prisma.$transaction(async (tx) => {
        // Only re-check on an actual schedule change — don't retroactively
        // block an unrelated edit (e.g. notes) on an appointment that was
        // already double-booked before this check existed.
        if (scheduleChanged && entity.getStatus() !== 'CANCELLED') {
          await this.assertNoConflict(tx, entity, entity.getId());
        }
        const row = await tx.appointments.update({
          where: { id: entity.getId() },
          data: {
            appointment_date: entity.getAppointmentDate(),
            start_time: entity.getStartTime(),
            end_time: entity.getEndTime(),
            status: entity.getStatus(),
            appointment_type: entity.getName().getValue(),
            reason: entity.getDescription() ?? null,
            notes: entity.getNotes() ?? null,
          },
        });
        return this.toDomain(row);
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertNoConflict(tx, entity);
      const row = await tx.appointments.create({
        data: {
          patient_id: entity.getPatientId(),
          doctor_id: entity.getDoctorId(),
          appointment_date: entity.getAppointmentDate(),
          start_time: entity.getStartTime(),
          end_time: entity.getEndTime(),
          status: entity.getStatus(),
          appointment_type: entity.getName().getValue(),
          reason: entity.getDescription() ?? null,
          notes: entity.getNotes() ?? null,
          created_by: entity.getCreatedBy(),
        },
      });
      return this.toDomain(row);
    });
  }

  /**
   * Reject a create/reschedule that would double-book the doctor: another
   * non-cancelled appointment for the same doctor, same date, whose
   * [start_time, end_time) window overlaps the incoming one. Runs inside the
   * same transaction as the write to shrink (not fully eliminate, absent a
   * DB-level exclusion constraint) the race between two concurrent requests.
   */
  private async assertNoConflict(
    tx: Prisma.TransactionClient,
    entity: Appointment,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await tx.appointments.findFirst({
      where: {
        doctor_id: entity.getDoctorId(),
        deleted_at: null,
        status: { not: 'CANCELLED' },
        appointment_date: entity.getAppointmentDate(),
        start_time: { lt: entity.getEndTime() },
        end_time: { gt: entity.getStartTime() },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException(
        'This doctor already has an appointment that overlaps this time slot.',
      );
    }
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Appointment | null> {
    const row = await this.prisma.appointments.findFirst({
      where: { id, deleted_at: null },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Appointment[]> {
    const rows = await this.prisma.appointments.findMany({
      where: { deleted_at: null },
      orderBy: { appointment_date: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.appointments.count({
        where: { id, deleted_at: null },
      })) > 0
    );
  }

  public async findMany(query: AppointmentsQueryDto): Promise<AppointmentPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 500);
    const skip = (page - 1) * limit;
    const from = query.from ? new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`) : undefined;
    const to = query.to ? new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`) : undefined;
    const where = {
      deleted_at: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.doctorId ? { doctor_id: query.doctorId } : {}),
      ...(from || to
        ? {
            appointment_date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                appointment_type: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                reason: {
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
      this.prisma.appointments.count({ where }),
      this.prisma.appointments.findMany({
        where,
        skip,
        take: limit,
        orderBy: { appointment_date: 'desc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.appointments.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  protected toDomain(row: {
    id: string;
    patient_id: string;
    doctor_id: string;
    appointment_date: Date;
    start_time: Date;
    end_time: Date;
    status: string;
    appointment_type: string | null;
    reason: string | null;
    notes: string | null;
    created_by: string;
    created_at: Date;
    updated_at: Date;
  }): Appointment {
    const type = row.appointment_type?.trim() || 'CONSULTATION';
    return Appointment.reconstitute(
      row.id,
      {
        name: AppointmentName.create(type.slice(0, 255)),
        description: row.reason ?? undefined,
        patientId: row.patient_id,
        doctorId: row.doctor_id,
        appointmentDate: row.appointment_date,
        startTime: row.start_time,
        endTime: row.end_time,
        createdBy: row.created_by,
        status: row.status,
        notes: row.notes,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
