/**
 * Prisma visits repository — clinical.outpatient_visits.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type {
  IVisitsRepository,
  VisitRow,
} from './visits.repository.interface';

@Injectable()
export class PrismaVisitsRepository implements IVisitsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async count(): Promise<number> {
    return this.prisma.outpatientVisits.count();
  }

  public async findAllOrdered(): Promise<VisitRow[]> {
    // Active pipeline (FIFO) + today's completed (for billing receipts / sign-off list).
    // Completed visits must not fill the active cap or new work disappears.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [active, completedToday] = await Promise.all([
      this.prisma.outpatientVisits.findMany({
        where: { stage: { not: 'COMPLETED' } },
        orderBy: { checked_in_at: 'asc' },
        take: 300,
      }),
      this.prisma.outpatientVisits.findMany({
        where: {
          stage: 'COMPLETED',
          checked_in_at: { gte: today },
        },
        orderBy: { checked_in_at: 'desc' },
        take: 80,
      }),
    ]);
    const seen = new Set(active.map((r) => r.id));
    return [...active, ...completedToday.filter((r) => !seen.has(r.id))];
  }

  public async findById(id: string): Promise<VisitRow | null> {
    return this.prisma.outpatientVisits.findUnique({ where: { id } });
  }

  public async findByAppointmentId(
    appointmentId: string,
  ): Promise<VisitRow | null> {
    return this.prisma.outpatientVisits.findFirst({
      where: {
        payload: { path: ['appointmentId'], equals: appointmentId },
      },
      orderBy: { checked_in_at: 'desc' },
    });
  }

  public async create(data: {
    id?: string;
    patientId: string | null;
    patientName: string;
    mrn: string;
    age: number;
    gender: string;
    phone: string;
    firstVisit: boolean;
    stage: string;
    checkedInAt: Date;
    reasonForVisit?: string | null;
    additionalNotes?: string | null;
    payload: unknown;
  }): Promise<VisitRow> {
    return this.prisma.outpatientVisits.create({
      data: {
        id: data.id,
        patient_id: data.patientId,
        patient_name: data.patientName,
        mrn: data.mrn,
        age: data.age,
        gender: data.gender,
        phone: data.phone,
        first_visit: data.firstVisit,
        stage: data.stage,
        checked_in_at: data.checkedInAt,
        reason_for_visit: data.reasonForVisit ?? null,
        additional_notes: data.additionalNotes ?? null,
        payload: data.payload as Prisma.InputJsonValue,
      },
    });
  }

  public async update(
    id: string,
    data: {
      stage: string;
      patientName: string;
      mrn: string;
      age: number;
      gender: string;
      phone: string;
      firstVisit: boolean;
      reasonForVisit?: string | null;
      additionalNotes?: string | null;
      triagePriority?: string | null;
      triageCompletedAt?: Date | null;
      payload: unknown;
    },
  ): Promise<VisitRow> {
    return this.prisma.outpatientVisits.update({
      where: { id },
      data: {
        stage: data.stage,
        patient_name: data.patientName,
        mrn: data.mrn,
        age: data.age,
        gender: data.gender,
        phone: data.phone,
        first_visit: data.firstVisit,
        reason_for_visit: data.reasonForVisit ?? null,
        additional_notes: data.additionalNotes ?? null,
        ...(data.triagePriority !== undefined
          ? { triage_priority: data.triagePriority }
          : {}),
        ...(data.triageCompletedAt !== undefined
          ? { triage_completed_at: data.triageCompletedAt }
          : {}),
        payload: data.payload as Prisma.InputJsonValue,
      },
    });
  }

  public async findPatientIdByMrn(mrn: string): Promise<string | null> {
    const patient = await this.prisma.patients.findUnique({
      where: { patient_number: mrn },
    });
    return patient?.id ?? null;
  }

  public async findAppointment(
    id: string,
  ): Promise<{ id: string; status: string } | null> {
    const appt = await this.prisma.appointments.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, status: true },
    });
    return appt;
  }

  public async markAppointmentArrived(id: string): Promise<void> {
    await this.prisma.appointments.update({
      where: { id },
      data: { status: 'ARRIVED' },
    });
  }

  public async upsertLabRequest(input: {
    requestNumber: string;
    patientId: string;
    status: string;
    notes: string;
    requestedBy: string;
    consultationId?: string | null;
  }): Promise<void> {
    await this.prisma.laboratoryRequests.upsert({
      where: { request_number: input.requestNumber },
      create: {
        request_number: input.requestNumber,
        patient_id: input.patientId,
        priority: 'NORMAL',
        status: input.status,
        notes: input.notes,
        requested_by: input.requestedBy,
        consultation_id: input.consultationId || null,
      },
      update: {
        status: input.status,
        notes: input.notes,
        ...(input.consultationId
          ? { consultation_id: input.consultationId }
          : {}),
      },
    });
  }

  public async findAdminUserId(): Promise<string | undefined> {
    const admin = await this.prisma.user.findFirst({
      where: { email: 'admin@nyalife.health', deleted_at: null },
      select: { id: true },
    });
    return admin?.id;
  }
}
