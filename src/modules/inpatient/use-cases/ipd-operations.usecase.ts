/**
 * IPD board operations — wards/beds CRUD, reservations, nursing notes,
 * discharge summaries, overview. Complements IpdJourneyUseCase state machine.
 * Source of truth: db.sql inpatient.*
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';

const BED_STATUSES = [
  'AVAILABLE',
  'OCCUPIED',
  'MAINTENANCE',
  'RESERVED',
] as const;

const WARD_TYPES = [
  'GENERAL',
  'ICU',
  'NICU',
  'MATERNITY',
  'PEDIATRIC',
  'PRIVATE',
  'SEMI_PRIVATE',
] as const;

function paginate(filters?: { page?: number; limit?: number }) {
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 100);
  const page = Math.max(filters?.page ?? 1, 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

function patientSearchWhere(q: string): Prisma.PatientsWhereInput {
  const trimmed = q.trim();
  return {
    OR: [
      { patient_number: { contains: trimmed, mode: 'insensitive' } },
      {
        user: {
          core_profiles_user_id: {
            some: {
              OR: [
                { first_name: { contains: trimmed, mode: 'insensitive' } },
                { last_name: { contains: trimmed, mode: 'insensitive' } },
              ],
            },
          },
        },
      },
    ],
  };
}

/** Manual bed status changes allowed outside journey (not OCCUPIED). */
const MANUAL_BED_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ['MAINTENANCE', 'RESERVED'],
  MAINTENANCE: ['AVAILABLE'],
  RESERVED: ['AVAILABLE', 'MAINTENANCE'],
  OCCUPIED: [], // only via admit/transfer/discharge/convert
};

@Injectable()
export class IpdOperationsUseCase {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
  ) {}

  // ── Overview ──────────────────────────────────────────────

  public async overview() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      wards,
      bedGroups,
      activeAdmissions,
      todaysAdmissions,
      pendingReservations,
      recentTransfers,
      recentDischarges,
    ] = await Promise.all([
      this.prisma.wards.count({ where: { is_active: true } }),
      this.prisma.beds.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.admissions.count({ where: { status: 'ADMITTED' } }),
      this.prisma.admissions.count({
        where: { admission_date: { gte: startOfDay } },
      }),
      this.prisma.bedReservations.count({ where: { status: 'RESERVED' } }),
      this.prisma.bedTransfers.findMany({
        orderBy: { transfer_date: 'desc' },
        take: 8,
        include: {
          admission: {
            include: {
              patient: {
                include: { user: { include: { core_profiles_user_id: true } } },
              },
            },
          },
          new_bed: { include: { ward: true } },
        },
      }),
      this.prisma.admissions.findMany({
        where: { status: 'DISCHARGED' },
        orderBy: { discharge_date: 'desc' },
        take: 8,
        include: {
          patient: {
            include: { user: { include: { core_profiles_user_id: true } } },
          },
        },
      }),
    ]);

    const bedsByStatus: Record<string, number> = {
      AVAILABLE: 0,
      OCCUPIED: 0,
      RESERVED: 0,
      MAINTENANCE: 0,
    };
    let totalBeds = 0;
    for (const g of bedGroups) {
      bedsByStatus[g.status] = g._count._all;
      totalBeds += g._count._all;
    }

    const patientName = (row: {
      user: { core_profiles_user_id: { first_name: string; last_name: string }[] };
      patient_number: string;
    }) => {
      const p = row.user.core_profiles_user_id[0];
      return p ? `${p.first_name} ${p.last_name}` : row.patient_number;
    };

    return {
      wards,
      totalBeds,
      availableBeds: bedsByStatus.AVAILABLE,
      occupiedBeds: bedsByStatus.OCCUPIED,
      reservedBeds: bedsByStatus.RESERVED,
      maintenanceBeds: bedsByStatus.MAINTENANCE,
      activeAdmissions,
      todaysAdmissions,
      pendingReservations,
      recentTransfers: recentTransfers.map((t) => ({
        id: t.id,
        admissionId: t.admission_id,
        patientName: patientName(t.admission.patient),
        newWard: t.new_bed.ward.name,
        newBed: t.new_bed.bed_number,
        reason: t.reason,
        at: t.transfer_date.toISOString(),
      })),
      recentDischarges: recentDischarges.map((a) => ({
        id: a.id,
        patientName: patientName(a.patient),
        mrn: a.patient.patient_number,
        dischargedAt: a.discharge_date?.toISOString() ?? null,
        diagnosis: a.primary_diagnosis,
      })),
    };
  }

  // ── Wards ─────────────────────────────────────────────────

  public async listWards(filters?: {
    active?: boolean;
    wardType?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    if (filters?.wardType) {
      const wt = filters.wardType.toUpperCase();
      if (!WARD_TYPES.includes(wt as (typeof WARD_TYPES)[number])) {
        throw new BadRequestException(
          `wardType must be one of ${WARD_TYPES.join(', ')}`,
        );
      }
      filters.wardType = wt;
    }
    const { limit, page, skip } = paginate(filters);
    const q = filters?.search?.trim();
    const where = {
      ...(filters?.active !== undefined
        ? { is_active: filters.active }
        : { is_active: true }),
      ...(filters?.wardType ? { ward_type: filters.wardType } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };
    const [wards, total] = await Promise.all([
      this.prisma.wards.findMany({
        where,
        include: {
          inpatient_beds_ward_id: { select: { id: true, status: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.wards.count({ where }),
    ]);
    const items = wards.map((w) => {
      const beds = w.inpatient_beds_ward_id;
      return {
        id: w.id,
        name: w.name,
        wardType: w.ward_type,
        departmentId: w.department_id,
        dailyRate: Number(w.daily_rate),
        capacity: w.capacity,
        isActive: w.is_active,
        totalBeds: beds.length || w.capacity,
        availableBeds: beds.filter((b) => b.status === 'AVAILABLE').length,
        occupiedBeds: beds.filter((b) => b.status === 'OCCUPIED').length,
        reservedBeds: beds.filter((b) => b.status === 'RESERVED').length,
        maintenanceBeds: beds.filter((b) => b.status === 'MAINTENANCE').length,
      };
    });
    return { items, total, page, limit };
  }

  public async getWard(wardId: string) {
    const w = await this.prisma.wards.findFirst({
      where: { id: wardId },
      include: {
        inpatient_beds_ward_id: { orderBy: { bed_number: 'asc' } },
      },
    });
    if (!w) throw new NotFoundException('Ward not found');
    const beds = w.inpatient_beds_ward_id;
    return {
      id: w.id,
      name: w.name,
      wardType: w.ward_type,
      departmentId: w.department_id,
      dailyRate: Number(w.daily_rate),
      capacity: w.capacity,
      isActive: w.is_active,
      beds: beds.map((b) => ({
        id: b.id,
        bedNumber: b.bed_number,
        status: b.status,
      })),
      totals: {
        total: beds.length,
        available: beds.filter((b) => b.status === 'AVAILABLE').length,
        occupied: beds.filter((b) => b.status === 'OCCUPIED').length,
        reserved: beds.filter((b) => b.status === 'RESERVED').length,
        maintenance: beds.filter((b) => b.status === 'MAINTENANCE').length,
      },
    };
  }

  public async updateWard(
    wardId: string,
    input: {
      name?: string;
      wardType?: string;
      departmentId?: string | null;
      dailyRate?: number;
      capacity?: number;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.wards.findFirst({ where: { id: wardId } });
    if (!existing) throw new NotFoundException('Ward not found');
    if (input.wardType) {
      const wt = input.wardType.toUpperCase();
      if (!WARD_TYPES.includes(wt as (typeof WARD_TYPES)[number])) {
        throw new BadRequestException(
          `wardType must be one of ${WARD_TYPES.join(', ')}`,
        );
      }
      input.wardType = wt;
    }
    return this.prisma.wards.update({
      where: { id: wardId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.wardType !== undefined ? { ward_type: input.wardType } : {}),
        ...(input.departmentId !== undefined
          ? { department_id: input.departmentId }
          : {}),
        ...(input.dailyRate !== undefined ? { daily_rate: input.dailyRate } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      },
    });
  }

  public async deactivateWard(wardId: string) {
    const occupied = await this.prisma.beds.count({
      where: { ward_id: wardId, status: 'OCCUPIED' },
    });
    if (occupied > 0) {
      throw new BadRequestException(
        'Cannot deactivate ward with occupied beds — discharge or transfer patients first',
      );
    }
    return this.updateWard(wardId, { isActive: false });
  }

  // ── Beds ──────────────────────────────────────────────────

  public async listBeds(filters?: {
    wardId?: string;
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    if (filters?.status) {
      const st = filters.status.toUpperCase();
      if (!BED_STATUSES.includes(st as (typeof BED_STATUSES)[number])) {
        throw new BadRequestException(
          `status must be one of ${BED_STATUSES.join(', ')}`,
        );
      }
      filters.status = st;
    }
    const { limit, page, skip } = paginate(filters);
    const q = filters?.search?.trim();
    const where = {
      ...(filters?.wardId ? { ward_id: filters.wardId } : {}),
      ...(filters?.status ? { status: filters.status } : {}),
      ...(q
        ? { bed_number: { contains: q, mode: 'insensitive' as const } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.beds.findMany({
        where,
        include: { ward: true },
        orderBy: [{ ward: { name: 'asc' } }, { bed_number: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.beds.count({ where }),
    ]);
    const items = rows.map((b) => ({
      id: b.id,
      wardId: b.ward_id,
      wardName: b.ward.name,
      bedNumber: b.bed_number,
      status: b.status,
    }));
    return { items, total, page, limit };
  }

  public async updateBedStatus(
    bedId: string,
    status: string,
    actorUserId?: string,
  ) {
    const next = status.toUpperCase();
    if (!BED_STATUSES.includes(next as (typeof BED_STATUSES)[number])) {
      throw new BadRequestException(
        `status must be one of ${BED_STATUSES.join(', ')}`,
      );
    }
    const bed = await this.prisma.beds.findFirst({ where: { id: bedId } });
    if (!bed) throw new NotFoundException('Bed not found');
    if (bed.status === next) return bed;

    const allowed = MANUAL_BED_TRANSITIONS[bed.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot change bed from ${bed.status} to ${next} manually — use admit/transfer/discharge/reservation flows for occupancy`,
      );
    }
    if (next === 'AVAILABLE' || next === 'MAINTENANCE') {
      const active = await this.prisma.admissions.findFirst({
        where: { bed_id: bedId, status: 'ADMITTED' },
      });
      if (active) {
        throw new BadRequestException(
          'Bed has an active admission — transfer or discharge first',
        );
      }
    }
    const updated = await this.prisma.beds.update({
      where: { id: bedId },
      data: { status: next },
    });
    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'UPDATE',
      entityType: 'inpatient.beds',
      entityId: bedId,
      oldValues: { status: bed.status },
      newValues: { status: next },
    });
    return updated;
  }

  public async createBedsBulk(input: {
    wardId: string;
    bedNumbers: string[];
  }) {
    const ward = await this.prisma.wards.findFirst({
      where: { id: input.wardId, is_active: true },
    });
    if (!ward) throw new NotFoundException('Ward not found');
    const numbers = [
      ...new Set(input.bedNumbers.map((n) => n.trim()).filter(Boolean)),
    ];
    if (!numbers.length) {
      throw new BadRequestException('bedNumbers required');
    }

    return this.prisma.$transaction(async (tx) => {
      const duplicates = await tx.beds.findMany({
        where: {
          ward_id: input.wardId,
          bed_number: { in: numbers },
        },
        select: { bed_number: true },
      });
      if (duplicates.length) {
        throw new BadRequestException(
          `Bed(s) already exist in this ward: ${duplicates
            .map((d) => d.bed_number)
            .join(', ')}`,
        );
      }

      await tx.beds.createMany({
        data: numbers.map((bed_number) => ({
          ward_id: input.wardId,
          bed_number,
          status: 'AVAILABLE',
        })),
      });

      return tx.beds.findMany({
        where: {
          ward_id: input.wardId,
          bed_number: { in: numbers },
        },
        orderBy: { bed_number: 'asc' },
      });
    });
  }

  // ── Admissions detail / deceased ──────────────────────────

  public async getAdmission(admissionId: string) {
    const r = await this.prisma.admissions.findFirst({
      where: { id: admissionId },
      include: {
        patient: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        bed: { include: { ward: true } },
        admitting_doctor: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
        inpatient_bed_transfers_admission_id: {
          orderBy: { transfer_date: 'asc' },
          take: 50,
        },
        inpatient_nursing_notes_admission_id: {
          orderBy: { created_at: 'desc' },
          take: 50,
          include: {
            nurse: {
              include: { user: { include: { core_profiles_user_id: true } } },
            },
          },
        },
        inpatient_discharge_summaries_admission_id: true,
      },
    });
    if (!r) throw new NotFoundException('Admission not found');
    const pp = r.patient.user.core_profiles_user_id[0];
    const dp = r.admitting_doctor.user.core_profiles_user_id[0];
    const summary = r.inpatient_discharge_summaries_admission_id[0] ?? null;
    return {
      id: r.id,
      status: r.status,
      patientId: r.patient_id,
      patientName: pp
        ? `${pp.first_name} ${pp.last_name}`
        : r.patient.patient_number,
      mrn: r.patient.patient_number,
      bedId: r.bed_id,
      bedNumber: r.bed?.bed_number ?? null,
      wardId: r.bed?.ward_id ?? null,
      wardName: r.bed?.ward?.name ?? null,
      admittingDoctorId: r.admitting_doctor_id,
      admittingDoctor: dp ? `Dr. ${dp.first_name} ${dp.last_name}` : '—',
      diagnosis: r.primary_diagnosis,
      admittedAt: r.admission_date.toISOString(),
      dischargedAt: r.discharge_date?.toISOString() ?? null,
      transfers: r.inpatient_bed_transfers_admission_id.map((t) => ({
        id: t.id,
        oldBedId: t.old_bed_id,
        newBedId: t.new_bed_id,
        reason: t.reason,
        at: t.transfer_date.toISOString(),
        authorizedBy: t.authorized_by,
      })),
      nursingNotes: r.inpatient_nursing_notes_admission_id.map((n) => {
        const np = n.nurse.user.core_profiles_user_id[0];
        return {
          id: n.id,
          notesText: n.notes_text,
          vitalSignsSnapshot: n.vital_signs_snapshot,
          nurseId: n.nurse_id,
          nurseName: np ? `${np.first_name} ${np.last_name}` : n.nurse.employee_id,
          createdAt: n.created_at.toISOString(),
        };
      }),
      dischargeSummary: summary
        ? {
            id: summary.id,
            dischargeDiagnosis: summary.discharge_diagnosis,
            summaryOfTreatment: summary.summary_of_treatment,
            dischargeMedications: summary.discharge_medications,
            followUpInstructions: summary.follow_up_instructions,
            dischargingDoctorId: summary.discharging_doctor_id,
            finalizedAt: summary.finalized_at?.toISOString() ?? null,
            finalizedBy: summary.finalized_by,
          }
        : null,
    };
  }

  public async listAdmissions(filters?: {
    status?: string;
    patientId?: string;
    activeOnly?: boolean;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { limit, page, skip } = paginate(filters);
    const status = filters?.status?.toUpperCase();
    const q = filters?.search?.trim();
    const where = {
      ...(status
        ? { status }
        : filters?.activeOnly
          ? { status: 'ADMITTED' }
          : {}),
      ...(filters?.patientId ? { patient_id: filters.patientId } : {}),
      ...(q ? { patient: patientSearchWhere(q) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.admissions.findMany({
        where,
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
        skip,
        take: limit,
      }),
      this.prisma.admissions.count({ where }),
    ]);
    const items = rows.map((r) => {
      const pp = r.patient.user.core_profiles_user_id[0];
      const dp = r.admitting_doctor.user.core_profiles_user_id[0];
      return {
        id: r.id,
        status: r.status,
        patientId: r.patient_id,
        patientName: pp
          ? `${pp.first_name} ${pp.last_name}`
          : r.patient.patient_number,
        mrn: r.patient.patient_number,
        wardName: r.bed?.ward?.name ?? '—',
        bedNumber: r.bed?.bed_number ?? '—',
        bedId: r.bed_id,
        wardId: r.bed?.ward_id ?? null,
        admittingDoctor: dp
          ? `Dr. ${dp.first_name} ${dp.last_name}`
          : '—',
        admittingDoctorId: r.admitting_doctor_id,
        diagnosis: r.primary_diagnosis,
        admittedAt: r.admission_date.toISOString(),
        dischargedAt: r.discharge_date?.toISOString() ?? null,
      };
    });
    return { items, total, page, limit };
  }

  public async markDeceased(input: {
    admissionId: string;
    actorUserId: string;
    notes?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
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
      const updated = await tx.admissions.update({
        where: { id: admission.id },
        data: {
          status: 'DECEASED',
          discharge_date: new Date(),
          bed_id: null,
          primary_diagnosis: input.notes
            ? `${admission.primary_diagnosis || ''} · Deceased: ${input.notes}`
            : admission.primary_diagnosis,
        },
      });
      return updated;
    }).then(async (updated) => {
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'UPDATE',
        entityType: 'inpatient.admissions',
        entityId: input.admissionId,
        newValues: { event: 'DECEASED', status: 'DECEASED' },
      });
      return updated;
    });
  }

  // ── Reservations ──────────────────────────────────────────

  public async listReservations(filters?: {
    status?: string;
    bedId?: string;
    patientId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    await this.expireDueReservations();
    const { limit, page, skip } = paginate(filters);
    const status = filters?.status?.toUpperCase();
    const q = filters?.search?.trim();
    const where = {
      ...(status ? { status } : {}),
      ...(filters?.bedId ? { bed_id: filters.bedId } : {}),
      ...(filters?.patientId ? { patient_id: filters.patientId } : {}),
      ...(filters?.from || filters?.to
        ? {
            expected_admission_date: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(q ? { patient: patientSearchWhere(q) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.bedReservations.findMany({
        where,
        include: {
          bed: { include: { ward: true } },
          patient: {
            include: { user: { include: { core_profiles_user_id: true } } },
          },
        },
        orderBy: { expected_admission_date: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.bedReservations.count({ where }),
    ]);
    const items = rows.map((r) => {
      const pp = r.patient.user.core_profiles_user_id[0];
      return {
        id: r.id,
        status: r.status,
        bedId: r.bed_id,
        bedNumber: r.bed.bed_number,
        wardName: r.bed.ward.name,
        wardId: r.bed.ward_id,
        patientId: r.patient_id,
        patientName: pp
          ? `${pp.first_name} ${pp.last_name}`
          : r.patient.patient_number,
        mrn: r.patient.patient_number,
        expectedAdmissionDate: r.expected_admission_date
          .toISOString()
          .slice(0, 10),
        expiresAt: r.expires_at.toISOString(),
        reservedBy: r.reserved_by,
        admissionId: r.admission_id,
      };
    });
    return { items, total, page, limit };
  }

  public async reserveBed(input: {
    bedId: string;
    patientId: string;
    expectedAdmissionDate: string;
    expiresAt: string;
    reservedBy: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patients.findFirst({
        where: { id: input.patientId, deleted_at: null },
      });
      if (!patient) throw new NotFoundException('Patient not found');

      const conflict = await tx.bedReservations.findFirst({
        where: { bed_id: input.bedId, status: 'RESERVED' },
      });
      if (conflict) {
        throw new BadRequestException('Bed already has an active reservation');
      }

      const claimed = await tx.beds.updateMany({
        where: { id: input.bedId, status: 'AVAILABLE' },
        data: { status: 'RESERVED' },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Bed is not available to reserve');
      }

      return tx.bedReservations.create({
        data: {
          bed_id: input.bedId,
          patient_id: input.patientId,
          expected_admission_date: new Date(input.expectedAdmissionDate),
          expires_at: new Date(input.expiresAt),
          reserved_by: input.reservedBy,
          status: 'RESERVED',
        },
      });
    }).then(async (row) => {
      await this.audit.recordMutation({
        userId: input.reservedBy,
        action: 'CREATE',
        entityType: 'inpatient.bed_reservations',
        entityId: row.id,
        newValues: { bedId: input.bedId, patientId: input.patientId },
      });
      return row;
    });
  }

  public async cancelReservation(reservationId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.bedReservations.findFirst({
        where: { id: reservationId, status: 'RESERVED' },
      });
      if (!res) throw new NotFoundException('Active reservation not found');
      await tx.bedReservations.update({
        where: { id: res.id },
        data: { status: 'CANCELLED' },
      });
      await tx.beds.updateMany({
        where: { id: res.bed_id, status: 'RESERVED' },
        data: { status: 'AVAILABLE' },
      });
      return { id: res.id, status: 'CANCELLED' };
    }).then(async (result) => {
      await this.audit.recordMutation({
        userId: actorUserId,
        action: 'UPDATE',
        entityType: 'inpatient.bed_reservations',
        entityId: reservationId,
        newValues: { status: 'CANCELLED' },
      });
      return result;
    });
  }

  public async convertReservation(input: {
    reservationId: string;
    admittingDoctorId: string;
    primaryDiagnosis?: string;
    actorUserId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.bedReservations.findFirst({
        where: { id: input.reservationId, status: 'RESERVED' },
      });
      if (!res) throw new NotFoundException('Active reservation not found');
      if (res.expires_at.getTime() < Date.now()) {
        throw new BadRequestException('Reservation has expired');
      }

      const doctor = await tx.staffProfiles.findFirst({
        where: { id: input.admittingDoctorId, deleted_at: null },
      });
      if (!doctor) throw new NotFoundException('Admitting doctor not found');

      const active = await tx.admissions.findFirst({
        where: { patient_id: res.patient_id, status: 'ADMITTED' },
      });
      if (active) {
        throw new BadRequestException('Patient already has an active admission');
      }

      const occupied = await tx.beds.updateMany({
        where: {
          id: res.bed_id,
          status: { in: ['RESERVED', 'AVAILABLE'] },
        },
        data: { status: 'OCCUPIED' },
      });
      if (occupied.count !== 1) {
        throw new BadRequestException('Reserved bed is no longer assignable');
      }

      const admission = await tx.admissions.create({
        data: {
          patient_id: res.patient_id,
          bed_id: res.bed_id,
          admitting_doctor_id: input.admittingDoctorId,
          primary_diagnosis:
            input.primaryDiagnosis || 'Admission from bed reservation',
          status: 'ADMITTED',
        },
      });

      await tx.bedReservations.update({
        where: { id: res.id },
        data: { status: 'CONVERTED', admission_id: admission.id },
      });

      return { admission, reservationId: res.id };
    }).then(async (result) => {
      await this.audit.recordMutation({
        userId: input.actorUserId,
        action: 'UPDATE',
        entityType: 'inpatient.bed_reservations',
        entityId: input.reservationId,
        newValues: {
          status: 'CONVERTED',
          admissionId: result.admission.id,
        },
      });
      return result;
    });
  }

  public async expireDueReservations(): Promise<number> {
    const due = await this.prisma.bedReservations.findMany({
      where: { status: 'RESERVED', expires_at: { lt: new Date() } },
      take: 50,
    });
    for (const res of due) {
      await this.prisma.$transaction(async (tx) => {
        await tx.bedReservations.update({
          where: { id: res.id },
          data: { status: 'EXPIRED' },
        });
        await tx.beds.updateMany({
          where: { id: res.bed_id, status: 'RESERVED' },
          data: { status: 'AVAILABLE' },
        });
      });
    }
    return due.length;
  }

  public async expireReservation(reservationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.bedReservations.findFirst({
        where: { id: reservationId, status: 'RESERVED' },
      });
      if (!res) throw new NotFoundException('Active reservation not found');
      await tx.bedReservations.update({
        where: { id: res.id },
        data: { status: 'EXPIRED' },
      });
      await tx.beds.updateMany({
        where: { id: res.bed_id, status: 'RESERVED' },
        data: { status: 'AVAILABLE' },
      });
      return { id: res.id, status: 'EXPIRED' };
    });
  }

  // ── Nursing notes ─────────────────────────────────────────

  public async addNursingNote(input: {
    admissionId: string;
    nurseId: string;
    notesText: string;
    vitalSignsSnapshot?: Record<string, unknown>;
    actorUserId?: string;
  }) {
    const admission = await this.prisma.admissions.findFirst({
      where: { id: input.admissionId, status: 'ADMITTED' },
    });
    if (!admission) {
      throw new NotFoundException('Active admission not found');
    }
    let nurse = await this.prisma.staffProfiles.findFirst({
      where: { id: input.nurseId, deleted_at: null },
    });
    if (!nurse) {
      nurse = await this.prisma.staffProfiles.findFirst({
        where: { user_id: input.nurseId, deleted_at: null },
      });
    }
    if (!nurse) throw new NotFoundException('Nurse not found');
    if (!input.notesText?.trim()) {
      throw new BadRequestException('notesText is required');
    }
    if (
      input.vitalSignsSnapshot !== undefined &&
      (typeof input.vitalSignsSnapshot !== 'object' ||
        Array.isArray(input.vitalSignsSnapshot) ||
        input.vitalSignsSnapshot === null)
    ) {
      throw new BadRequestException(
        'vitalSignsSnapshot must be a JSON object when provided',
      );
    }
    const note = await this.prisma.nursingNotes.create({
      data: {
        admission_id: input.admissionId,
        nurse_id: nurse.id,
        notes_text: input.notesText.trim(),
        vital_signs_snapshot: input.vitalSignsSnapshot
          ? (input.vitalSignsSnapshot as Prisma.InputJsonValue)
          : undefined,
      },
    });
    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: 'CREATE',
      entityType: 'inpatient.nursing_notes',
      entityId: note.id,
      newValues: { admissionId: input.admissionId },
    });
    return note;
  }

  public async getNursingNote(noteId: string) {
    const n = await this.prisma.nursingNotes.findFirst({
      where: { id: noteId },
      include: {
        nurse: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
      },
    });
    if (!n) throw new NotFoundException('Nursing note not found');
    const np = n.nurse.user.core_profiles_user_id[0];
    return {
      id: n.id,
      admissionId: n.admission_id,
      notesText: n.notes_text,
      vitalSignsSnapshot: n.vital_signs_snapshot,
      nurseId: n.nurse_id,
      nurseName: np ? `${np.first_name} ${np.last_name}` : n.nurse.employee_id,
      createdAt: n.created_at.toISOString(),
    };
  }

  public async listNursingNotes(admissionId: string) {
    const rows = await this.prisma.nursingNotes.findMany({
      where: { admission_id: admissionId },
      include: {
        nurse: {
          include: { user: { include: { core_profiles_user_id: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return rows.map((n) => {
      const np = n.nurse.user.core_profiles_user_id[0];
      return {
        id: n.id,
        admissionId: n.admission_id,
        notesText: n.notes_text,
        vitalSignsSnapshot: n.vital_signs_snapshot,
        nurseId: n.nurse_id,
        nurseName: np ? `${np.first_name} ${np.last_name}` : n.nurse.employee_id,
        createdAt: n.created_at.toISOString(),
      };
    });
  }

  // ── Discharge summary ─────────────────────────────────────

  public async upsertDischargeSummary(input: {
    admissionId: string;
    dischargingDoctorId: string;
    dischargeDiagnosis?: string;
    summaryOfTreatment?: string;
    dischargeMedications?: string;
    followUpInstructions?: string;
    actorUserId?: string;
  }) {
    const admission = await this.prisma.admissions.findFirst({
      where: { id: input.admissionId },
    });
    if (!admission) throw new NotFoundException('Admission not found');
    if (admission.status !== 'ADMITTED') {
      throw new BadRequestException(
        'Discharge summary can only be drafted for ADMITTED patients',
      );
    }

    const existing = await this.prisma.dischargeSummaries.findUnique({
      where: { admission_id: input.admissionId },
    });
    if (existing?.finalized_at) {
      throw new BadRequestException(
        'Discharge summary is finalized and cannot be modified',
      );
    }

    const doctor = await this.prisma.staffProfiles.findFirst({
      where: { id: input.dischargingDoctorId, deleted_at: null },
    });
    if (!doctor) throw new NotFoundException('Discharging doctor not found');

    const data = {
      discharging_doctor_id: input.dischargingDoctorId,
      discharge_diagnosis: input.dischargeDiagnosis,
      summary_of_treatment: input.summaryOfTreatment,
      discharge_medications: input.dischargeMedications,
      follow_up_instructions: input.followUpInstructions,
    };

    const row = existing
      ? await this.prisma.dischargeSummaries.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.dischargeSummaries.create({
          data: { admission_id: input.admissionId, ...data },
        });

    await this.audit.recordMutation({
      userId: input.actorUserId,
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'inpatient.discharge_summaries',
      entityId: row.id,
    });
    return row;
  }

  public async finalizeDischargeSummary(
    admissionId: string,
    finalizedBy: string,
  ) {
    const existing = await this.prisma.dischargeSummaries.findUnique({
      where: { admission_id: admissionId },
    });
    if (!existing) {
      throw new NotFoundException('Discharge summary draft not found');
    }
    if (existing.finalized_at) {
      throw new BadRequestException('Discharge summary already finalized');
    }
    if (
      !existing.discharge_diagnosis?.trim() ||
      !existing.summary_of_treatment?.trim()
    ) {
      throw new BadRequestException(
        'Discharge diagnosis and summary of treatment are required before finalize',
      );
    }
    const row = await this.prisma.dischargeSummaries.update({
      where: { id: existing.id },
      data: {
        finalized_at: new Date(),
        finalized_by: finalizedBy,
      },
    });
    await this.audit.recordMutation({
      userId: finalizedBy,
      action: 'UPDATE',
      entityType: 'inpatient.discharge_summaries',
      entityId: row.id,
      newValues: { event: 'FINALIZE' },
    });
    return row;
  }

  public async getDischargeSummary(admissionId: string) {
    const row = await this.prisma.dischargeSummaries.findUnique({
      where: { admission_id: admissionId },
    });
    if (!row) throw new NotFoundException('Discharge summary not found');
    return {
      id: row.id,
      admissionId: row.admission_id,
      dischargeDiagnosis: row.discharge_diagnosis,
      summaryOfTreatment: row.summary_of_treatment,
      dischargeMedications: row.discharge_medications,
      followUpInstructions: row.follow_up_instructions,
      dischargingDoctorId: row.discharging_doctor_id,
      finalizedAt: row.finalized_at?.toISOString() ?? null,
      finalizedBy: row.finalized_by,
    };
  }
}
