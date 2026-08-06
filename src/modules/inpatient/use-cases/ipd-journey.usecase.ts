/**
 * IPD journey use-case — ward → bed → admit → transfer → discharge.
 * Source of truth: db.sql inpatient.* (no rooms table — beds hang off wards).
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';

export const IPD_EVENTS = {
  WARD_CREATED: 'ipd.ward.created',
  BED_CREATED: 'ipd.bed.created',
  PATIENT_ADMITTED: 'ipd.patient.admitted',
  PATIENT_TRANSFERRED: 'ipd.patient.transferred',
  PATIENT_DISCHARGED: 'ipd.patient.discharged',
} as const;

const WARD_TYPES = [
  'GENERAL',
  'ICU',
  'NICU',
  'MATERNITY',
  'PEDIATRIC',
  'PRIVATE',
  'SEMI_PRIVATE',
] as const;

@Injectable()
export class IpdJourneyUseCase {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: HmsAuditWriter,
  ) {}

  public async createWard(input: {
    name: string;
    wardType?: string;
    departmentId?: string;
    dailyRate?: number;
    capacity?: number;
  }) {
    const wardType = (input.wardType || 'GENERAL').toUpperCase();
    if (!WARD_TYPES.includes(wardType as (typeof WARD_TYPES)[number])) {
      throw new BadRequestException(
        `wardType must be one of ${WARD_TYPES.join(', ')}`,
      );
    }
    const ward = await this.prisma.wards.create({
      data: {
        name: input.name.trim(),
        ward_type: wardType,
        department_id: input.departmentId,
        daily_rate: input.dailyRate ?? 0,
        capacity: input.capacity ?? 0,
        is_active: true,
      },
    });
    this.events.emit(IPD_EVENTS.WARD_CREATED, { wardId: ward.id });
    return ward;
  }

  public async createBed(input: { wardId: string; bedNumber: string }) {
    const ward = await this.prisma.wards.findFirst({
      where: { id: input.wardId, is_active: true },
    });
    if (!ward) throw new NotFoundException('Ward not found');
    const bed = await this.prisma.beds.create({
      data: {
        ward_id: input.wardId,
        bed_number: input.bedNumber.trim(),
        status: 'AVAILABLE',
      },
    });
    this.events.emit(IPD_EVENTS.BED_CREATED, {
      bedId: bed.id,
      wardId: input.wardId,
    });
    return bed;
  }

  /**
   * Atomic admit: create ADMITTED admission + occupy bed.
   * Rejects if bed is not AVAILABLE.
   */
  public async admit(input: {
    patientId: string;
    bedId: string;
    admittingDoctorId: string;
    primaryDiagnosis?: string;
    actorUserId?: string;
  }) {
    const admission = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patients.findFirst({
        where: { id: input.patientId, deleted_at: null },
      });
      if (!patient) throw new NotFoundException('Patient not found');

      const doctor = await tx.staffProfiles.findFirst({
        where: { id: input.admittingDoctorId, deleted_at: null },
      });
      if (!doctor) throw new NotFoundException('Admitting doctor not found');

      const occupied = await tx.beds.updateMany({
        where: { id: input.bedId, status: 'AVAILABLE' },
        data: { status: 'OCCUPIED' },
      });
      if (occupied.count !== 1) {
        throw new BadRequestException('Bed is not available');
      }

      const active = await tx.admissions.findFirst({
        where: { patient_id: input.patientId, status: 'ADMITTED' },
      });
      if (active) {
        throw new BadRequestException('Patient already has an active admission');
      }

      return tx.admissions.create({
        data: {
          patient_id: input.patientId,
          bed_id: input.bedId,
          admitting_doctor_id: input.admittingDoctorId,
          primary_diagnosis: input.primaryDiagnosis || 'Clinical admission',
          status: 'ADMITTED',
        },
      });
    });

    this.events.emit(IPD_EVENTS.PATIENT_ADMITTED, {
      admissionId: admission.id,
      patientId: input.patientId,
      bedId: input.bedId,
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'inpatient.admissions',
      entityId: admission.id,
      newValues: {
        patientId: input.patientId,
        bedId: input.bedId,
        status: 'ADMITTED',
      },
    });
    return admission;
  }

  /**
   * In-facility bed transfer.
   * Admission remains clinically ADMITTED after the move; movement history
   * is recorded in bed_transfers. Status TRANSFERRED is reserved for
   * facility/external transfer-out (see transferOut).
   */
  public async transfer(input: {
    admissionId: string;
    newBedId: string;
    authorizedBy: string;
    reason?: string;
  }) {
    if (!input.authorizedBy?.trim()) {
      throw new BadRequestException('authorizedBy is required');
    }
    return this.prisma.$transaction(async (tx) => {
      const admission = await tx.admissions.findFirst({
        where: { id: input.admissionId, status: 'ADMITTED' },
      });
      if (!admission) {
        throw new NotFoundException('Active admission not found');
      }
      if (admission.bed_id === input.newBedId) {
        throw new BadRequestException('Patient is already on this bed');
      }

      // Allowed transition path: ADMITTED → TRANSFERRED → ADMITTED
      await tx.admissions.update({
        where: { id: admission.id },
        data: { status: 'TRANSFERRED' },
      });

      const claimed = await tx.beds.updateMany({
        where: { id: input.newBedId, status: 'AVAILABLE' },
        data: { status: 'OCCUPIED' },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Target bed is not available');
      }

      if (admission.bed_id) {
        await tx.beds.update({
          where: { id: admission.bed_id },
          data: { status: 'AVAILABLE' },
        });
      }

      const transfer = await tx.bedTransfers.create({
        data: {
          admission_id: admission.id,
          old_bed_id: admission.bed_id,
          new_bed_id: input.newBedId,
          reason: input.reason || 'Bed transfer',
          authorized_by: input.authorizedBy,
        },
      });

      const updated = await tx.admissions.update({
        where: { id: admission.id },
        data: { bed_id: input.newBedId, status: 'ADMITTED' },
      });

      this.events.emit(IPD_EVENTS.PATIENT_TRANSFERRED, {
        admissionId: admission.id,
        transferId: transfer.id,
        oldBedId: admission.bed_id,
        newBedId: input.newBedId,
      });
      return { admission: updated, transfer };
    }).then(async (result) => {
      await this.audit.recordMutation({
        userId: input.authorizedBy,
        action: 'UPDATE',
        entityType: 'inpatient.admissions',
        entityId: input.admissionId,
        newValues: {
          event: 'BED_TRANSFER',
          transition: 'ADMITTED→TRANSFERRED→ADMITTED',
          newBedId: input.newBedId,
          transferId: result.transfer.id,
        },
      });
      return result;
    });
  }

  /**
   * Facility / external transfer-out: ends active occupancy with sticky
   * TRANSFERRED status (distinct from DISCHARGED).
   */
  public async transferOut(input: {
    admissionId: string;
    authorizedBy: string;
    reason: string;
    destination?: string;
  }) {
    if (!input.authorizedBy?.trim()) {
      throw new BadRequestException('authorizedBy is required');
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException('reason is required for transfer-out');
    }
    return this.prisma
      .$transaction(async (tx) => {
        const admission = await tx.admissions.findFirst({
          where: { id: input.admissionId, status: 'ADMITTED' },
        });
        if (!admission) {
          throw new NotFoundException('Active admission not found');
        }

        const freedBedId = admission.bed_id;
        if (freedBedId) {
          await tx.beds.update({
            where: { id: freedBedId },
            data: { status: 'AVAILABLE' },
          });
        }

        const reason = input.destination
          ? `${input.reason.trim()} → ${input.destination.trim()}`
          : input.reason.trim();

        const updated = await tx.admissions.update({
          where: { id: admission.id },
          data: {
            status: 'TRANSFERRED',
            discharge_date: new Date(),
            bed_id: null,
            primary_diagnosis: admission.primary_diagnosis
              ? `${admission.primary_diagnosis} · Transferred out: ${reason}`
              : `Transferred out: ${reason}`,
          },
        });
        return { updated, freedBedId };
      })
      .then(async ({ updated, freedBedId }) => {
        await this.audit.recordMutation({
          userId: input.authorizedBy,
          action: 'UPDATE',
          entityType: 'inpatient.admissions',
          entityId: input.admissionId,
          newValues: {
            event: 'TRANSFER_OUT',
            status: 'TRANSFERRED',
            reason: input.reason,
            destination: input.destination,
            freedBedId,
          },
        });
        return updated;
      });
  }

  /**
   * Discharge: free bed, set DISCHARGED, optional discharge summary.
   */
  public async discharge(input: {
    admissionId: string;
    dischargingDoctorId: string;
    finalizedBy: string;
    diagnosis?: string;
    summary?: string;
    medications?: string;
    followUpInstructions?: string;
  }) {
    return this.prisma
      .$transaction(async (tx) => {
        const admission = await tx.admissions.findFirst({
          where: { id: input.admissionId, status: 'ADMITTED' },
        });
        if (!admission) {
          throw new NotFoundException('Active admission not found');
        }

        if (admission.bed_id) {
          await tx.beds.update({
            where: { id: admission.bed_id },
            data: { status: 'AVAILABLE' },
          });
        }

        const discharged = await tx.admissions.update({
          where: { id: admission.id },
          data: {
            status: 'DISCHARGED',
            discharge_date: new Date(),
            bed_id: null,
          },
        });

        const existing = await tx.dischargeSummaries.findUnique({
          where: { admission_id: admission.id },
        });
        const summaryData = {
          discharge_diagnosis:
            input.diagnosis ||
            existing?.discharge_diagnosis ||
            admission.primary_diagnosis,
          summary_of_treatment:
            input.summary || existing?.summary_of_treatment || 'Discharged',
          discharge_medications:
            input.medications ?? existing?.discharge_medications ?? null,
          follow_up_instructions:
            input.followUpInstructions ??
            existing?.follow_up_instructions ??
            null,
          discharging_doctor_id: input.dischargingDoctorId,
          finalized_at: new Date(),
          finalized_by: input.finalizedBy,
        };
        if (existing) {
          if (existing.finalized_at) {
            throw new BadRequestException(
              'Discharge summary already finalized',
            );
          }
          await tx.dischargeSummaries.update({
            where: { id: existing.id },
            data: summaryData,
          });
        } else {
          await tx.dischargeSummaries.create({
            data: { admission_id: admission.id, ...summaryData },
          });
        }

        this.events.emit(IPD_EVENTS.PATIENT_DISCHARGED, {
          admissionId: admission.id,
          patientId: admission.patient_id,
          freedBedId: admission.bed_id,
        });
        return discharged;
      })
      .then(async (discharged) => {
        await this.audit.recordMutation({
          userId: input.finalizedBy,
          action: 'UPDATE',
          entityType: 'inpatient.admissions',
          entityId: input.admissionId,
          newValues: { event: 'DISCHARGE', status: 'DISCHARGED' },
        });
        return discharged;
      });
  }

  public async listTransfers(admissionId: string) {
    return this.prisma.bedTransfers.findMany({
      where: { admission_id: admissionId },
      orderBy: { transfer_date: 'asc' },
      take: 100,
    });
  }

  /** Active admissions for the inpatient board (discharge / transfer UI). */
  public async listActiveAdmissions() {
    const rows = await this.prisma.admissions.findMany({
      where: { status: 'ADMITTED' },
      include: {
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        bed: { include: { ward: true } },
        admitting_doctor: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
      },
      orderBy: { admission_date: 'desc' },
      take: 100,
    });

    return rows.map((r) => {
      const pp = r.patient.user.core_profiles_user_id[0];
      const dp = r.admitting_doctor.user.core_profiles_user_id[0];
      return {
        id: r.id,
        patientId: r.patient_id,
        patientName: pp
          ? `${pp.first_name} ${pp.last_name}`
          : r.patient.patient_number,
        mrn: r.patient.patient_number,
        wardId: r.bed?.ward_id ?? null,
        wardName: r.bed?.ward?.name ?? '—',
        bedId: r.bed_id,
        bedNumber: r.bed?.bed_number ?? '—',
        admittingDoctorId: r.admitting_doctor_id,
        admittingDoctor: dp
          ? `Dr. ${dp.first_name} ${dp.last_name}`
          : '—',
        diagnosis: r.primary_diagnosis,
        admittedAt: r.admission_date.toISOString(),
        status: r.status,
      };
    });
  }

  public async listBeds(opts?: {
    availableOnly?: boolean;
    wardId?: string;
  }) {
    const availableOnly = opts?.availableOnly === true;
    const rows = await this.prisma.beds.findMany({
      where: {
        ...(availableOnly ? { status: 'AVAILABLE' } : {}),
        ...(opts?.wardId ? { ward_id: opts.wardId } : {}),
      },
      include: { ward: true },
      orderBy: [{ ward: { name: 'asc' } }, { bed_number: 'asc' }],
      take: 300,
    });
    return rows.map((b) => ({
      id: b.id,
      wardId: b.ward_id,
      wardName: b.ward.name,
      bedNumber: b.bed_number,
      status: b.status,
    }));
  }
}
