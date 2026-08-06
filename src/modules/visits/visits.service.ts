/**
 * Visits application service — workflow orchestration over IVisitsRepository.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BillingSettlementService } from '../billing/billing-settlement.service';
import { PharmacyDispenseService } from '../billing/pharmacy-dispense.service';
import type {
  LabTestOrder,
  PrescriptionLine,
  Visit,
  VisitStage,
  Vitals,
} from './visit.types';
import {
  VISITS_REPOSITORY,
  type IVisitsRepository,
  type VisitRow,
} from './repositories/visits.repository.interface';

type VisitPayload = {
  payment: Visit['payment'];
  appointmentId?: string;
  vitals?: Vitals;
  nurseName?: string;
  doctorName?: string;
  labOrder?: Visit['labOrder'];
  diagnosis?: string;
  prescriptions?: PrescriptionLine[];
  followUpDate?: string;
  billing?: Visit['billing'];
  pharmacy?: Visit['pharmacy'];
};

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

const MEMORY_SEED: Visit[] = [
  {
    id: 'v-seed-1',
    patientName: 'Joseph Kamau',
    mrn: 'MRN-00412',
    age: 46,
    gender: 'Male',
    phone: '+254 712 345 678',
    firstVisit: false,
    payment: { method: 'CASH' },
    stage: 'CHECKED_IN',
    checkedInAt: minutesAgo(12),
  },
  {
    id: 'v-seed-2',
    patientName: 'Lucy Wambui',
    mrn: 'MRN-00329',
    age: 39,
    gender: 'Female',
    phone: '+254 719 456 802',
    firstVisit: false,
    payment: {
      method: 'INSURANCE',
      provider: 'SHA (Social Health Authority)',
      policyNumber: 'SHA-88231',
      status: 'APPROVED',
      memberName: 'Lucy Wambui',
      benefitBalance: 180_000,
    },
    stage: 'WAITING_DOCTOR',
    checkedInAt: minutesAgo(35),
    nurseName: 'Grace Wanjiru',
    doctorName: 'Dr. Amina Okello',
    vitals: {
      temperature: '37.8',
      systolic: '124',
      diastolic: '82',
      pulse: '88',
      respRate: '18',
      spo2: '97',
      weightKg: '68',
    },
  },
];

@Injectable()
export class VisitsService implements OnModuleInit {
  private memory: Visit[] = structuredClone(MEMORY_SEED);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(VISITS_REPOSITORY) private readonly visits: IVisitsRepository,
    private readonly billing: BillingSettlementService,
    private readonly dispense: PharmacyDispenseService,
  ) {}

  private requireDb(): void {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException(
        'Database unavailable — visit pipeline requires Supabase/Prisma',
      );
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.prisma.isConnected) return;
    await this.billing.ensureFeeSchedule();
    const count = await this.visits.count();
    if (count > 0) return;
    for (const visit of MEMORY_SEED) {
      await this.persistNew(visit);
    }
  }

  async findAll(): Promise<Visit[]> {
    this.requireDb();
    const rows = await this.visits.findAllOrdered();
    return rows.map((r) => this.fromRow(r));
  }

  async findOne(id: string): Promise<Visit> {
    this.requireDb();
    const row = await this.visits.findById(id);
    if (!row) throw new NotFoundException(`Visit ${id} not found`);
    return this.fromRow(row);
  }

  async checkIn(
    input: Omit<Visit, 'id' | 'stage' | 'checkedInAt'>,
  ): Promise<Visit> {
    this.requireDb();
    if (input.appointmentId) {
      await this.markAppointmentArrived(input.appointmentId);
    }
    const visit: Visit = {
      ...input,
      id: randomUUID(),
      stage: 'CHECKED_IN',
      checkedInAt: new Date().toISOString(),
    };
    return this.persistNew(visit);
  }

  private async markAppointmentArrived(appointmentId: string): Promise<void> {
    const appt = await this.visits.findAppointment(appointmentId);
    if (!appt) {
      throw new NotFoundException(`Appointment ${appointmentId} not found`);
    }
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appt.status)) {
      throw new BadRequestException(
        `Cannot check in appointment in status ${appt.status}`,
      );
    }
    if (appt.status !== 'ARRIVED') {
      await this.visits.markAppointmentArrived(appointmentId);
    }
  }

  async recordTriage(
    id: string,
    vitals: Vitals,
    doctorName: string,
    nurseName: string,
  ): Promise<Visit> {
    return this.patch(id, {
      vitals,
      doctorName,
      nurseName,
      stage: 'WAITING_DOCTOR',
    });
  }

  async startConsultation(id: string): Promise<Visit> {
    return this.patch(id, { stage: 'IN_CONSULTATION' });
  }

  async orderLabs(
    id: string,
    tests: LabTestOrder[],
    notes: string,
    actorUserId: string,
  ): Promise<Visit> {
    const visit = await this.patch(id, {
      labOrder: { tests, notes },
      stage: 'LAB_PENDING',
    });
    await this.persistLabRequest(visit, actorUserId, 'PENDING');
    return visit;
  }

  async submitLabResults(
    id: string,
    tests: LabTestOrder[],
    comments: string,
    actorUserId: string,
  ): Promise<Visit> {
    const visit = await this.findOne(id);
    const next = await this.patch(id, {
      labOrder: {
        ...visit.labOrder,
        tests,
        comments,
        completedAt: new Date().toISOString(),
      },
      stage: 'RESULTS_READY',
    });
    await this.persistLabRequest(next, actorUserId, 'COMPLETED');
    return next;
  }

  async completeConsultation(
    id: string,
    outcome: {
      diagnosis: string;
      prescriptions: PrescriptionLine[];
      followUpDate?: string;
    },
  ): Promise<Visit> {
    return this.patch(id, { ...outcome, stage: 'READY_FOR_BILLING' });
  }

  async finalizeBilling(
    id: string,
    total: number,
    actorUserId: string,
    claimId?: string,
  ): Promise<Visit> {
    const visit = await this.findOne(id);
    const insurance = visit.payment.method === 'INSURANCE';
    const cashFallback =
      visit.stage === 'CLAIM_SUBMITTED' &&
      visit.billing?.claimStatus === 'REJECTED';

    const fees = await this.billing.getFeeSchedule();
    const lines = [
      { description: 'Consultation', amount: fees.consult },
      ...(visit.labOrder?.tests ?? []).map((t) => ({
        description: `Lab: ${t.name}`,
        amount: fees.lab,
      })),
      ...(visit.prescriptions ?? []).map((p) => ({
        description: `Medication: ${p.medication}`,
        amount: fees.medication,
      })),
    ];
    const computedTotal = lines.reduce((s, l) => s + l.amount, 0);
    const billTotal = total > 0 ? total : computedTotal;

    const persistedClaim = claimId;

    // Cash settle (first time or after claim rejection)
    if (!insurance || cashFallback) {
      const settled = await this.billing.settleVisit({
        createdByUserId: actorUserId,
        mrn: visit.mrn,
        patientName: visit.patientName,
        lines,
        total: billTotal,
        mode: 'CASH',
        diagnosis: visit.diagnosis,
      });
      const pharmacy = await this.dispenseVisitMeds(visit, actorUserId);
      return this.patch(id, {
        billing: {
          total: billTotal,
          mode: 'CASH',
          claimId: visit.billing?.claimId,
          claimStatus: cashFallback ? 'REJECTED' : undefined,
          invoiceNumber: settled.invoiceNumber,
          paymentChannel: 'CASH',
        },
        pharmacy,
        stage: 'COMPLETED',
      });
    }

    if (!claimId) {
      throw new BadRequestException(
        'Insurance visits require a submitted claim id before billing can proceed.',
      );
    }

    // Claim already created by InsuranceService — hold visit until payer accepts.
    return this.patch(id, {
      billing: {
        total: billTotal,
        mode: 'CLAIM',
        claimId: persistedClaim,
        claimStatus: 'SUBMITTED',
        invoiceNumber: visit.billing?.invoiceNumber,
        paymentChannel: 'INSURANCE',
      },
      stage: 'CLAIM_SUBMITTED',
    });
  }

  async updateClaimStatus(
    id: string,
    status: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED',
    actorUserId?: string,
  ): Promise<Visit> {
    const visit = await this.findOne(id);
    if (!visit.billing) {
      throw new NotFoundException('Visit has no billing record');
    }
    if (visit.billing.claimId) {
      await this.billing.syncClaimStatus(visit.billing.claimId, status);
    }

    const signedOff = status === 'ACCEPTED';
    let performedBy = actorUserId;
    if (signedOff && !performedBy) {
      performedBy = await this.visits.findAdminUserId();
    }
    const pharmacy =
      signedOff && performedBy
        ? await this.dispenseVisitMeds(visit, performedBy)
        : visit.pharmacy;
    return this.patch(id, {
      billing: { ...visit.billing, claimStatus: status },
      pharmacy,
      stage: signedOff
        ? 'COMPLETED'
        : visit.stage === 'CLAIM_SUBMITTED' || visit.stage === 'READY_FOR_BILLING'
          ? 'CLAIM_SUBMITTED'
          : visit.stage,
    });
  }

  private async dispenseVisitMeds(
    visit: Visit,
    performedBy: string,
  ): Promise<Visit['pharmacy']> {
    if (!visit.prescriptions?.length) return visit.pharmacy;
    if (visit.pharmacy?.dispensed) return visit.pharmacy;
    await this.dispense.dispenseForVisit({
      visitId: visit.id,
      lines: visit.prescriptions.map((p) => ({
        medication: p.medication,
        medicationId: p.medicationId,
      })),
      performedBy,
    });
    return { dispensed: true, dispensedAt: new Date().toISOString() };
  }

  async signOff(id: string): Promise<Visit> {
    const visit = await this.findOne(id);
    if (visit.stage === 'COMPLETED') return visit;
    if (
      visit.payment.method === 'INSURANCE' &&
      visit.billing?.claimStatus !== 'ACCEPTED'
    ) {
      throw new BadRequestException(
        'Cannot sign off — insurer has not accepted the claim yet.',
      );
    }
    return this.patch(id, { stage: 'COMPLETED' });
  }

  private async persistLabRequest(
    visit: Visit,
    actorUserId: string,
    status: 'PENDING' | 'COMPLETED',
  ): Promise<void> {
    if (!visit.labOrder) return;
    const patientId = await this.visits.findPatientIdByMrn(visit.mrn);
    if (!patientId) return;

    const requestNumber = `LAB-${visit.id.slice(0, 8).toUpperCase()}`;
    const notes = JSON.stringify({
      tests: visit.labOrder.tests,
      doctorNotes: visit.labOrder.notes,
      comments: visit.labOrder.comments,
      doctorName: visit.doctorName,
    });

    await this.visits.upsertLabRequest({
      requestNumber,
      patientId,
      status,
      notes,
      requestedBy: actorUserId,
    });
  }

  private async patch(id: string, patch: Partial<Visit>): Promise<Visit> {
    this.requireDb();
    const existing = await this.visits.findById(id);
    if (!existing) throw new NotFoundException(`Visit ${id} not found`);
    const current = this.fromRow(existing);
    const next = { ...current, ...patch };
    const payload = this.toPayload(next);

    const row = await this.visits.update(id, {
      stage: next.stage,
      patientName: next.patientName,
      mrn: next.mrn,
      age: next.age,
      gender: next.gender,
      phone: next.phone,
      firstVisit: next.firstVisit,
      payload,
    });
    return this.fromRow(row);
  }

  private async persistNew(visit: Visit): Promise<Visit> {
    const patientId = await this.visits.findPatientIdByMrn(visit.mrn);
    const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      visit.id,
    );

    const row = await this.visits.create({
      id: uuidOk ? visit.id : undefined,
      patientId,
      patientName: visit.patientName,
      mrn: visit.mrn,
      age: visit.age,
      gender: visit.gender,
      phone: visit.phone,
      firstVisit: visit.firstVisit,
      stage: visit.stage,
      checkedInAt: new Date(visit.checkedInAt),
      payload: this.toPayload(visit),
    });
    return this.fromRow(row);
  }

  private toPayload(visit: Visit): VisitPayload {
    return {
      payment: visit.payment,
      appointmentId: visit.appointmentId,
      vitals: visit.vitals,
      nurseName: visit.nurseName,
      doctorName: visit.doctorName,
      labOrder: visit.labOrder,
      diagnosis: visit.diagnosis,
      prescriptions: visit.prescriptions,
      followUpDate: visit.followUpDate,
      billing: visit.billing,
      pharmacy: visit.pharmacy,
    };
  }

  private fromRow(row: VisitRow): Visit {
    const payload = (row.payload ?? {}) as unknown as VisitPayload;
    return {
      id: row.id,
      patientName: row.patient_name,
      mrn: row.mrn,
      age: row.age,
      gender: row.gender === 'Female' ? 'Female' : 'Male',
      phone: row.phone,
      firstVisit: row.first_visit,
      stage: row.stage as VisitStage,
      checkedInAt: row.checked_in_at.toISOString(),
      payment: payload.payment ?? { method: 'CASH' },
      appointmentId: payload.appointmentId,
      vitals: payload.vitals,
      nurseName: payload.nurseName,
      doctorName: payload.doctorName,
      labOrder: payload.labOrder,
      diagnosis: payload.diagnosis,
      prescriptions: payload.prescriptions,
      followUpDate: payload.followUpDate,
      billing: payload.billing,
      pharmacy: payload.pharmacy,
    };
  }
}
