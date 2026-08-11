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
import { PharmacyJourneyUseCase } from '../pharmacy/use-cases/pharmacy-journey.usecase';
import type { ClinicalRecord } from './clinical-record.types';
import type {
  LabTestOrder,
  OrderedClinicalItem,
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
  reasonForVisit?: string;
  additionalNotes?: string;
  vitals?: Vitals;
  nurseName?: string;
  doctorName?: string;
  labOrder?: Visit['labOrder'];
  diagnosis?: string;
  prescriptions?: PrescriptionLine[];
  followUpDate?: string;
  clinicalRecord?: ClinicalRecord;
  orderedServices?: OrderedClinicalItem[];
  orderedSurgeries?: OrderedClinicalItem[];
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
    private readonly pharmacyJourney: PharmacyJourneyUseCase,
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
    actorUserId?: string,
  ): Promise<Visit> {
    this.requireDb();
    if (input.appointmentId) {
      await this.markAppointmentArrived(input.appointmentId, {
        reasonForVisit: input.reasonForVisit,
        additionalNotes: input.additionalNotes,
      });
    }
    const visit: Visit = {
      ...input,
      id: randomUUID(),
      stage: 'CHECKED_IN',
      checkedInAt: new Date().toISOString(),
    };
    const created = await this.persistNew(visit);

    // System-wide: when enabled, cash/M-Pesa check-ins get an automatic draft consult invoice.
    if (
      actorUserId &&
      (await this.isConsultationFeeEnabled()) &&
      created.payment.method !== 'INSURANCE'
    ) {
      return this.chargeConsultFee(created.id, actorUserId);
    }

    return created;
  }

  /** System setting — admin can turn off for free-consultation days. Default: on. */
  async isConsultationFeeEnabled(): Promise<boolean> {
    if (!this.prisma.isConnected) return true;
    try {
      const row = await this.prisma.settings.findUnique({
        where: { key: 'consultation_fee_enabled' },
      });
      if (!row) return true;
      const v = row.value.trim().toLowerCase();
      if (['false', '0', 'no', 'off'].includes(v)) return false;
      return true;
    } catch {
      return true;
    }
  }

  private async markAppointmentArrived(
    appointmentId: string,
    cascade?: { reasonForVisit?: string; additionalNotes?: string },
  ): Promise<void> {
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
    const reason = cascade?.reasonForVisit?.trim();
    const notes = cascade?.additionalNotes?.trim();
    if (reason || notes) {
      await this.prisma.appointments.update({
        where: { id: appointmentId },
        data: {
          ...(reason ? { reason } : {}),
          ...(notes ? { notes } : {}),
        },
      });
    }
  }

  async recordTriage(
    id: string,
    vitals: Vitals,
    doctorName: string,
    nurseName: string,
  ): Promise<Visit> {
    const visit = await this.findOne(id);
    if (visit.stage === 'AWAITING_PAYMENT') {
      throw new BadRequestException(
        'Consultation fee is unpaid — send the patient to finance first, or waive the fee.',
      );
    }
    if (
      visit.billing?.consultFeeStatus === 'PENDING' &&
      visit.stage !== 'CHECKED_IN'
    ) {
      throw new BadRequestException(
        'Consultation fee is still pending payment.',
      );
    }
    return this.patch(id, {
      vitals,
      doctorName,
      nurseName,
      stage: 'WAITING_DOCTOR',
    });
  }

  /**
   * Consult fee at check-in (system-wide when enabled): create a draft invoice
   * and send the patient to the finance desk to pay (cash or M-Pesa).
   */
  async chargeConsultFee(id: string, actorUserId: string): Promise<Visit> {
    const visit = await this.findOne(id);
    if (visit.stage !== 'CHECKED_IN') {
      throw new BadRequestException(
        'Consultation fee can only be charged at the front desk while the patient is checked in (before triage vitals).',
      );
    }
    if (visit.billing?.consultFeeStatus === 'PAID') {
      throw new BadRequestException('Consultation fee is already paid for this visit.');
    }
    if (
      visit.billing?.consultFeeStatus === 'PENDING' &&
      visit.billing.invoiceId
    ) {
      return this.patch(id, { stage: 'AWAITING_PAYMENT' });
    }
    if (visit.payment.method === 'INSURANCE') {
      throw new BadRequestException(
        'Insurance visits are billed via claim after care — skip the cash consultation fee or check in as cash/M-Pesa.',
      );
    }

    const draft = await this.billing.createConsultFeeDraft({
      mrn: visit.mrn,
      patientName: visit.patientName,
      actorUserId,
      visitId: visit.id,
    });
    const amount = Number(draft.totalAmount);

    return this.patch(id, {
      stage: 'AWAITING_PAYMENT',
      billing: {
        total: amount,
        mode: 'CASH',
        invoiceId: draft.invoiceId,
        invoiceNumber: draft.invoiceNumber,
        consultFeeStatus: 'PENDING',
        consultFeeAmount: amount,
      },
    });
  }

  /** Skip the optional consult fee and keep the patient in the triage queue. */
  async waiveConsultFee(id: string): Promise<Visit> {
    const visit = await this.findOne(id);
    if (!['CHECKED_IN', 'AWAITING_PAYMENT'].includes(visit.stage)) {
      throw new BadRequestException(
        'Consultation fee can only be waived before the patient sees a doctor.',
      );
    }
    if (visit.billing?.consultFeeStatus === 'PAID') {
      throw new BadRequestException('Consultation fee is already paid.');
    }
    return this.patch(id, {
      stage: 'CHECKED_IN',
      billing: {
        ...(visit.billing ?? { total: 0, mode: 'CASH' }),
        total: visit.billing?.total ?? 0,
        mode: 'CASH',
        consultFeeStatus: 'WAIVED',
        consultFeeAmount: visit.billing?.consultFeeAmount,
        invoiceId: visit.billing?.invoiceId,
        invoiceNumber: visit.billing?.invoiceNumber,
      },
    });
  }

  /** Finance desk: issue draft consult invoice + collect cash (or mark after M-Pesa). */
  async collectConsultFee(
    id: string,
    actorUserId: string,
    mode: 'CASH' | 'MPESA',
    opts?: { transactionReference?: string; mpesaReceipt?: string },
  ): Promise<Visit> {
    const visit = await this.findOne(id);
    if (visit.stage !== 'AWAITING_PAYMENT') {
      throw new BadRequestException(
        'Visit is not waiting for consultation-fee payment.',
      );
    }
    if (!visit.billing?.invoiceId) {
      throw new BadRequestException(
        'No consultation-fee invoice is linked to this visit.',
      );
    }

    const paid = await this.billing.collectOnInvoice({
      invoiceId: visit.billing.invoiceId,
      mode,
      actorUserId,
      transactionReference: opts?.transactionReference,
      mpesaReceipt: opts?.mpesaReceipt,
    });

    return this.patch(id, {
      stage: 'CHECKED_IN',
      billing: {
        total: Number(paid.totalAmount),
        mode: 'CASH',
        invoiceId: paid.invoiceId,
        invoiceNumber: paid.invoiceNumber,
        receiptId: visit.billing.receiptId,
        mpesaReceipt: opts?.mpesaReceipt ?? visit.billing.mpesaReceipt,
        paymentChannel: mode,
        consultFeeStatus: 'PAID',
        consultFeeAmount: Number(paid.totalAmount),
        consultFeePaidAt: new Date().toISOString(),
      },
    });
  }

  async startConsultation(id: string): Promise<Visit> {
    return this.patch(id, { stage: 'IN_CONSULTATION' });
  }

  async saveClinicalRecord(
    id: string,
    clinicalRecord: ClinicalRecord,
  ): Promise<Visit> {
    const visit = await this.findOne(id);
    if (
      !['IN_CONSULTATION', 'LAB_PENDING', 'RESULTS_READY'].includes(visit.stage)
    ) {
      throw new BadRequestException(
        'Clinical notes can only be saved while the patient is with the doctor.',
      );
    }
    const impression = clinicalRecord.impression?.trim();
    return this.patch(id, {
      clinicalRecord,
      ...(impression ? { diagnosis: impression } : {}),
    });
  }

  async saveClinicalOrders(
    id: string,
    orders: {
      orderedServices?: OrderedClinicalItem[];
      orderedSurgeries?: OrderedClinicalItem[];
    },
  ): Promise<Visit> {
    const visit = await this.findOne(id);
    if (
      !['IN_CONSULTATION', 'LAB_PENDING', 'RESULTS_READY'].includes(visit.stage)
    ) {
      throw new BadRequestException(
        'Clinical orders can only be saved while the patient is with the doctor.',
      );
    }
    return this.patch(id, {
      orderedServices: orders.orderedServices ?? visit.orderedServices ?? [],
      orderedSurgeries: orders.orderedSurgeries ?? visit.orderedSurgeries ?? [],
    });
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
      clinicalRecord?: ClinicalRecord;
      orderedServices?: OrderedClinicalItem[];
      orderedSurgeries?: OrderedClinicalItem[];
    },
    actorUserId: string,
  ): Promise<Visit> {
    const visit = await this.findOne(id);
    const meds = (outcome.prescriptions ?? []).filter(
      (p) => p.medication?.trim() && p.medicationId,
    );
    const clinicalRecord =
      outcome.clinicalRecord ?? visit.clinicalRecord ?? undefined;
    const diagnosis =
      outcome.diagnosis?.trim() ||
      clinicalRecord?.impression?.trim() ||
      visit.diagnosis ||
      '';
    if (!diagnosis) {
      throw new BadRequestException(
        'Diagnosis / impression is required to complete the consultation.',
      );
    }

    const consultationId = await this.upsertClinicalConsultationRow(
      { ...visit, diagnosis, clinicalRecord },
      actorUserId,
      clinicalRecord,
    );

    let pharmacyMeta = visit.pharmacy;
    if (meds.length) {
      const patientId =
        (await this.visits.findPatientIdByMrn(visit.mrn)) ?? null;
      const prescriberId = await this.resolvePrescriberStaffId(
        actorUserId,
        visit.doctorName,
      );
      if (patientId && prescriberId) {
        try {
          const rx = await this.pharmacyJourney.createPrescription({
            patientId,
            prescribedByStaffId: prescriberId,
            consultationId: consultationId ?? undefined,
            notes: `Visit ${visit.id} · ${diagnosis}`.slice(0, 500),
            lines: meds.map((p) => ({
              medicationId: p.medicationId as string,
              dosage: p.dosage?.trim() || 'As directed',
              frequency: p.frequency?.trim() || 'As directed',
              duration: p.duration?.trim() || 'As directed',
              quantity: Math.max(1, Number(p.quantity) || 1),
            })),
            actorUserId,
          });
          pharmacyMeta = {
            ...pharmacyMeta,
            prescriptionId: rx.id,
            prescriptionNumber: rx.prescriptionNumber ?? undefined,
            sentAt: new Date().toISOString(),
          };
        } catch {
          // Visit still proceeds to billing; pharmacist can create Rx manually
        }
      }
    }

    return this.patch(id, {
      diagnosis,
      prescriptions: outcome.prescriptions,
      followUpDate: outcome.followUpDate,
      clinicalRecord,
      orderedServices:
        outcome.orderedServices ?? visit.orderedServices ?? [],
      orderedSurgeries:
        outcome.orderedSurgeries ?? visit.orderedSurgeries ?? [],
      pharmacy: pharmacyMeta,
      stage: 'READY_FOR_BILLING',
    });
  }

  /** Best-effort mirror into clinical.consultations for appointment/catalog views. */
  private async upsertClinicalConsultationRow(
    visit: Visit,
    actorUserId: string,
    clinical?: ClinicalRecord,
  ): Promise<string | null> {
    if (!clinical) return null;
    try {
      const patientId = await this.visits.findPatientIdByMrn(visit.mrn);
      if (!patientId) return null;
      const doctorId = await this.resolvePrescriberStaffId(
        actorUserId,
        visit.doctorName,
      );
      if (!doctorId) return null;

      const physical = [
        clinical.generalExamination,
        clinical.systemsExamination,
      ]
        .map((x) => x?.trim())
        .filter(Boolean)
        .join('\n\n');

      const pastMedical = [
        clinical.pastMedicalHistory,
        clinical.surgicalHistory
          ? `Surgical history:\n${clinical.surgicalHistory}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const data = {
        chief_complaint: clinical.chiefComplaint?.trim() || null,
        history_present_illness: clinical.historyPresentIllness?.trim() || null,
        past_medical_history: pastMedical || null,
        family_history: clinical.familyHistory?.trim() || null,
        social_history: clinical.socialHistory?.trim() || null,
        physical_examination: physical || null,
        treatment_plan: clinical.treatmentPlan?.trim() || null,
        follow_up_instructions: clinical.followUpInstructions?.trim() || null,
        notes: clinical.internalNotes?.trim() || null,
        priority: clinical.priority?.trim() || 'NORMAL',
        status: 'COMPLETED',
      };

      if (visit.appointmentId) {
        const existing = await this.prisma.consultations.findFirst({
          where: { appointment_id: visit.appointmentId, deleted_at: null },
        });
        if (existing) {
          await this.prisma.consultations.update({
            where: { id: existing.id },
            data,
          });
          return existing.id;
        }
      }

      const created = await this.prisma.consultations.create({
        data: {
          ...data,
          patient_id: patientId,
          doctor_id: doctorId,
          created_by: actorUserId,
          appointment_id: visit.appointmentId || null,
          consultation_date: new Date(),
        },
      });
      return created.id;
    } catch {
      // Non-blocking — visit payload remains source of truth for the pipeline
      return null;
    }
  }

  private async resolvePrescriberStaffId(
    actorUserId: string,
    doctorName?: string,
  ): Promise<string | null> {
    const byUser = await this.prisma.staffProfiles.findFirst({
      where: { user_id: actorUserId, deleted_at: null },
      select: { id: true },
    });
    if (byUser) return byUser.id;

    if (doctorName?.trim()) {
      const parts = doctorName.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/);
      const first = parts[0];
      const last = parts.slice(1).join(' ') || undefined;
      const byName = await this.prisma.staffProfiles.findFirst({
        where: {
          deleted_at: null,
          user: {
            core_profiles_user_id: {
              some: {
                ...(first ? { first_name: { equals: first, mode: 'insensitive' } } : {}),
                ...(last ? { last_name: { equals: last, mode: 'insensitive' } } : {}),
              },
            },
          },
        },
        select: { id: true },
      });
      if (byName) return byName.id;
    }

    const anyDoctor = await this.prisma.staffProfiles.findFirst({
      where: {
        deleted_at: null,
        is_active: true,
        user: {
          core_user_roles_user_id: {
            some: {
              role: { name: { in: ['DOCTOR', 'ADMIN', 'SUPER_ADMIN'] } },
            },
          },
        },
      },
      select: { id: true },
    });
    return anyDoctor?.id ?? null;
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
    const labCount = visit.labOrder?.tests?.length ?? 0;
    const medCount = visit.prescriptions?.length ?? 0;
    const consultAlreadyPaid = visit.billing?.consultFeeStatus === 'PAID';
    const orderedExtras = [
      ...(visit.orderedServices ?? []),
      ...(visit.orderedSurgeries ?? []),
    ];
    const extraServiceIds = orderedExtras.map((s) => s.id).filter(Boolean);
    const lines = [
      ...(consultAlreadyPaid
        ? []
        : [{ description: 'Consultation', amount: fees.consult }]),
      ...(visit.labOrder?.tests ?? []).map((t) => ({
        description: `Lab: ${t.name}`,
        amount: fees.lab,
      })),
      ...(visit.prescriptions ?? []).map((p) => ({
        description: `Medication: ${p.medication}`,
        amount: fees.medication,
      })),
      ...orderedExtras.map((s) => ({
        description: s.name,
        amount: Number(s.unitPrice) || 0,
      })),
    ];
    // Server is authoritative — client `total` is ignored
    void total;
    const quote = await this.billing.quoteVisit({
      consultCount: consultAlreadyPaid ? 0 : 1,
      labCount,
      medCount,
      extraServiceIds,
    });
    const quoteTotal = Number(quote.totalAmount);

    const persistedClaim = claimId;

    // Cash settle (first time or after claim rejection)
    if (!insurance || cashFallback) {
      if (lines.length === 0 || quoteTotal <= 0) {
        // Consult fee already collected at triage; nothing left to bill.
        const pharmacy = await this.dispenseVisitMeds(visit, actorUserId);
        return this.patch(id, {
          billing: {
            total: visit.billing?.consultFeeAmount ?? 0,
            mode: 'CASH',
            claimId: visit.billing?.claimId,
            claimStatus: cashFallback ? 'REJECTED' : undefined,
            invoiceId: visit.billing?.invoiceId,
            invoiceNumber: visit.billing?.invoiceNumber,
            paymentChannel: visit.billing?.paymentChannel ?? 'CASH',
            consultFeeStatus: visit.billing?.consultFeeStatus,
            consultFeeAmount: visit.billing?.consultFeeAmount,
            consultFeePaidAt: visit.billing?.consultFeePaidAt,
          },
          pharmacy,
          stage: 'COMPLETED',
        });
      }
      const settled = await this.billing.settleVisit({
        createdByUserId: actorUserId,
        mrn: visit.mrn,
        patientName: visit.patientName,
        lines,
        total: quoteTotal,
        mode: 'CASH',
        diagnosis: visit.diagnosis,
        extraServiceIds,
      });
      const billTotal = Number(settled.totalAmount);
      const pharmacy = await this.dispenseVisitMeds(visit, actorUserId);
      const receipt = await this.issueCashReceipt({
        visitId: visit.id,
        mrn: visit.mrn,
        patientName: visit.patientName,
        phone: visit.phone,
        invoiceId: settled.invoiceId,
        paymentId: settled.paymentId,
        amount: billTotal,
        lines,
        actorUserId,
        diagnosis: visit.diagnosis,
      });
      return this.patch(id, {
        billing: {
          total: billTotal + (consultAlreadyPaid ? (visit.billing?.consultFeeAmount ?? 0) : 0),
          mode: 'CASH',
          claimId: visit.billing?.claimId,
          claimStatus: cashFallback ? 'REJECTED' : undefined,
          invoiceId: settled.invoiceId,
          invoiceNumber: settled.invoiceNumber,
          receiptId: receipt?.id,
          receiptNumber: receipt?.receipt_number,
          paymentChannel: 'CASH',
          consultFeeStatus: visit.billing?.consultFeeStatus,
          consultFeeAmount: visit.billing?.consultFeeAmount,
          consultFeePaidAt: visit.billing?.consultFeePaidAt,
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
        total: quoteTotal,
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

  private async issueCashReceipt(input: {
    visitId: string;
    mrn: string;
    patientName: string;
    phone: string;
    invoiceId: string;
    paymentId?: string;
    amount: number;
    lines: Array<{ description: string; amount: number }>;
    actorUserId: string;
    diagnosis?: string;
  }): Promise<{ id: string; receipt_number: string } | null> {
    try {
      const patient = await this.prisma.patients.findUnique({
        where: { patient_number: input.mrn },
      });
      if (!patient) return null;
      const seq = await this.prisma.receipts.count();
      const receiptNumber = `RCP-${new Date().getFullYear()}-${String(seq + 1).padStart(5, '0')}`;
      return this.prisma.receipts.create({
        data: {
          receipt_number: receiptNumber,
          patient_id: patient.id,
          visit_id: input.visitId,
          invoice_id: input.invoiceId,
          payment_id: input.paymentId || null,
          channel: 'CASH',
          amount: input.amount,
          issued_by: input.actorUserId,
          line_items: input.lines,
          meta: {
            mrn: input.mrn,
            patientName: input.patientName,
            phone: input.phone,
            diagnosis: input.diagnosis,
            channel: 'CASH',
          },
        },
        select: { id: true, receipt_number: true },
      });
    } catch {
      return null;
    }
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
    if (!patientId) {
      throw new BadRequestException(
        `Cannot create laboratory request — patient ${visit.mrn} was not found`,
      );
    }

    const testNames = (visit.labOrder.tests ?? [])
      .map((t) => t.name?.trim())
      .filter(Boolean) as string[];

    const matched = testNames.length
      ? await this.prisma.testTypes.findMany({
          where: {
            is_active: true,
            OR: testNames.map((name) => ({
              test_name: { equals: name, mode: 'insensitive' as const },
            })),
          },
          select: { id: true, test_name: true },
        })
      : [];

    const orderedTestTypeIds = matched.map((t) => t.id);
    const notes = JSON.stringify({
      orderedTestTypeIds,
      text: visit.labOrder.notes || undefined,
      tests: visit.labOrder.tests,
      comments: visit.labOrder.comments,
      doctorName: visit.doctorName,
      visitId: visit.id,
    });

    const requestNumber = `LAB-${visit.id.slice(0, 8).toUpperCase()}`;

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
      reasonForVisit: next.reasonForVisit ?? null,
      additionalNotes: next.additionalNotes ?? null,
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
      reasonForVisit: visit.reasonForVisit ?? null,
      additionalNotes: visit.additionalNotes ?? null,
      payload: this.toPayload(visit),
    });
    return this.fromRow(row);
  }

  private toPayload(visit: Visit): VisitPayload {
    return {
      payment: visit.payment,
      appointmentId: visit.appointmentId,
      reasonForVisit: visit.reasonForVisit,
      additionalNotes: visit.additionalNotes,
      vitals: visit.vitals,
      nurseName: visit.nurseName,
      doctorName: visit.doctorName,
      labOrder: visit.labOrder,
      diagnosis: visit.diagnosis,
      prescriptions: visit.prescriptions,
      followUpDate: visit.followUpDate,
      clinicalRecord: visit.clinicalRecord,
      orderedServices: visit.orderedServices,
      orderedSurgeries: visit.orderedSurgeries,
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
      reasonForVisit: row.reason_for_visit ?? payload.reasonForVisit,
      additionalNotes: row.additional_notes ?? payload.additionalNotes,
      vitals: payload.vitals,
      nurseName: payload.nurseName,
      doctorName: payload.doctorName,
      labOrder: payload.labOrder,
      diagnosis: payload.diagnosis,
      prescriptions: payload.prescriptions,
      followUpDate: payload.followUpDate,
      clinicalRecord: payload.clinicalRecord,
      orderedServices: payload.orderedServices,
      orderedSurgeries: payload.orderedSurgeries,
      billing: payload.billing,
      pharmacy: payload.pharmacy,
    };
  }
}
