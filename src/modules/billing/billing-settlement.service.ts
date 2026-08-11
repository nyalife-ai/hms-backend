/**
 * Billing settlement orchestration — uses BillingFinanceService as the
 * authoritative financial engine (server totals, journals, allocations).
 */

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BillingFinanceService } from './billing-finance.service';
import { calculateInvoiceTotals } from './domain/invoice-calculator';
import { ensureBillingFoundation } from './finance/ensure-foundation';
import {
  BILLING_REPOSITORY,
  type IBillingRepository,
  type SettleVisitInput,
} from './repositories/billing.repository.interface';

export type FeeSchedule = {
  consult: number;
  lab: number;
  medication: number;
  consultServiceCode?: string;
  consultServiceName?: string;
  consultationFeeEnabled?: boolean;
};

@Injectable()
export class BillingSettlementService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly billingRepo: IBillingRepository,
    private readonly finance: BillingFinanceService,
    private readonly prisma: PrismaService,
  ) {}

  async getFeeSchedule(): Promise<FeeSchedule> {
    await this.ensureFeeSchedule();
    if (!this.billingRepo.isConnected()) {
      return {
        consult: 2500,
        lab: 1500,
        medication: 800,
        consultationFeeEnabled: true,
      };
    }

    let consult = 2500;
    let consultServiceCode = 'CONSULT';
    let consultServiceName = 'Outpatient Consultation';
    try {
      const resolved = await this.finance.resolveConsultFeeService();
      consult = Number(resolved.standardPrice);
      consultServiceCode = resolved.serviceCode;
      consultServiceName = resolved.serviceName;
    } catch {
      /* fall back to legacy CONSULT below */
    }

    const rows = await this.billingRepo.findActiveServicePrices([
      'CONSULT',
      'LAB',
      'MED',
    ]);
    const map = Object.fromEntries(
      rows.map((r) => [r.service_code, Number(r.standard_price)]),
    );
    if (!Number.isFinite(consult) || consult <= 0) {
      consult = map.CONSULT ?? 2500;
    }
    return {
      consult,
      lab: map.LAB ?? 1500,
      medication: map.MED ?? 800,
      consultServiceCode,
      consultServiceName,
      consultationFeeEnabled: await this.isConsultationFeeEnabled(),
    };
  }

  private async isConsultationFeeEnabled(): Promise<boolean> {
    try {
      const row = await this.prisma.settings.findUnique({
        where: { key: 'consultation_fee_enabled' },
      });
      if (!row) return true;
      const v = row.value.trim().toLowerCase();
      return !['false', '0', 'no', 'off'].includes(v);
    } catch {
      return true;
    }
  }

  async ensureFeeSchedule(): Promise<void> {
    if (!this.prisma.isConnected) return;
    await ensureBillingFoundation(this.prisma);
  }

  /**
   * Settle an OPD visit using formal invoices + journals.
   * Line amounts from the client are ignored — prices come from billing.services.
   */
  async settleVisit(input: SettleVisitInput): Promise<{
    invoiceId: string;
    invoiceNumber: string;
    paymentId?: string;
    claimNumber?: string;
    claimDbId?: string;
    totalAmount: string;
  }> {
    if (!this.billingRepo.isConnected()) {
      throw new NotFoundException('Database required for billing settlement');
    }
    await this.ensureFeeSchedule();

    const patient = await this.prisma.patients.findUnique({
      where: { patient_number: input.mrn },
    });
    if (!patient || patient.deleted_at) {
      throw new NotFoundException(
        `Patient ${input.mrn} not found — register the patient before billing`,
      );
    }

    let consultCount = 0;
    let labCount = 0;
    let medCount = 0;
    for (const line of input.lines) {
      const d = line.description.toLowerCase();
      if (d.startsWith('lab')) labCount += 1;
      else if (d.startsWith('medication') || d.startsWith('med')) medCount += 1;
      else if (d.startsWith('consultation')) consultCount += 1;
      // other descriptions (services/surgeries) are billed via extraServiceIds
    }
    const extraIds = [...new Set(input.extraServiceIds ?? [])];
    if (
      consultCount === 0 &&
      labCount === 0 &&
      medCount === 0 &&
      extraIds.length === 0
    ) {
      throw new BadRequestException(
        'Nothing to bill — no consultation, lab, medication, or service lines',
      );
    }

    const quote =
      consultCount + labCount + medCount > 0
        ? await this.finance.quoteVisitLines({
            consultCount,
            labCount,
            medCount,
          })
        : { lines: [] as Array<{
            serviceId: string;
            description: string;
            quantity: string;
            unitPrice: string;
          }> };

    const extras = extraIds.length
      ? await this.prisma.services.findMany({
          where: { id: { in: extraIds }, is_active: true },
        })
      : [];
    const extraLines = extras.map((s) => ({
      serviceId: s.id,
      description: s.service_name,
      quantity: '1',
      unitPrice: s.standard_price.toString(),
    }));

    const mergedLines = [...quote.lines, ...extraLines];
    if (!mergedLines.length) {
      throw new BadRequestException(
        'Nothing to bill — fee schedule or services unavailable',
      );
    }
    // Validate totals (authoritative path still uses line unit prices)
    void calculateInvoiceTotals({ lines: mergedLines });

    const invoice = await this.finance.createInvoice({
      patientId: patient.id,
      notes: input.diagnosis
        ? `Visit settlement · ${input.patientName} · ${input.diagnosis}`
        : `Visit settlement · ${input.patientName}`,
      lines: mergedLines.map((l) => ({
        serviceId: l.serviceId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      actorUserId: input.createdByUserId,
    });

    const issued = await this.finance.issueInvoice(
      invoice.id,
      input.createdByUserId,
    );

    if (input.mode === 'CASH' || input.mode === 'MPESA') {
      const methodCode = input.mode === 'MPESA' ? 'MPESA' : 'CASH';
      const method = await this.prisma.paymentMethods.findUnique({
        where: { method_code: methodCode },
      });
      if (!method) {
        throw new BadRequestException(
          `Payment method ${methodCode} is not configured`,
        );
      }
      const ref =
        input.transactionReference ||
        input.mpesaReceipt ||
        undefined;
      if (ref) {
        const dup = await this.prisma.payments.findFirst({
          where: { transaction_reference: ref, status: 'COMPLETED' },
        });
        if (dup) {
          return {
            invoiceId: issued.id,
            invoiceNumber: issued.invoiceNumber,
            paymentId: dup.id,
            totalAmount: issued.totalAmount,
          };
        }
      }
      const payment = await this.finance.createPayment({
        patientId: patient.id,
        amount: issued.totalAmount,
        paymentMethodId: method.id,
        transactionReference: ref,
        notes:
          input.mode === 'MPESA'
            ? `M-Pesa settlement for ${issued.invoiceNumber}`
            : `Cash settlement for ${issued.invoiceNumber}`,
        allocateToInvoiceId: issued.id,
        actorUserId: input.createdByUserId,
      });
      return {
        invoiceId: issued.id,
        invoiceNumber: issued.invoiceNumber,
        paymentId: payment.id,
        totalAmount: issued.totalAmount,
      };
    }

    // Insurance claim path — issue receivable invoice + submit claim
    const claim = await this.finance.createClaim({
      invoiceId: issued.id,
      amountClaimed: issued.totalAmount,
      insurancePolicyId: undefined,
      notes: input.claimExternalId
        ? `External ref: ${input.claimExternalId}`
        : undefined,
      actorUserId: input.createdByUserId,
    });

    // Prefer external claim number when provided by gateway
    if (input.claimExternalId) {
      await this.prisma.insuranceClaims.update({
        where: { id: claim.id },
        data: { claim_number: input.claimExternalId },
      });
    }

    if (input.providerId && input.policyNumber) {
      const policy = await this.prisma.insurancePolicies.findFirst({
        where: {
          patient_id: patient.id,
          provider_id: input.providerId,
          policy_number: input.policyNumber,
        },
      });
      if (policy) {
        await this.prisma.insuranceClaims.update({
          where: { id: claim.id },
          data: { insurance_policy_id: policy.id },
        });
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const created = await this.prisma.insurancePolicies.create({
          data: {
            patient_id: patient.id,
            provider_id: input.providerId,
            policy_number: input.policyNumber,
            start_date: today,
            expiry_date: new Date(
              today.getFullYear() + 1,
              today.getMonth(),
              today.getDate(),
            ),
            is_active: true,
          },
        });
        await this.prisma.insuranceClaims.update({
          where: { id: claim.id },
          data: { insurance_policy_id: created.id },
        });
      }
    }

    await this.finance.transitionClaim(claim.id, {
      status: 'SUBMITTED',
      actorUserId: input.createdByUserId,
    });

    const refreshed = await this.prisma.insuranceClaims.findUnique({
      where: { id: claim.id },
    });

    return {
      invoiceId: issued.id,
      invoiceNumber: issued.invoiceNumber,
      claimNumber: refreshed?.claim_number ?? claim.claimNumber,
      claimDbId: claim.id,
      totalAmount: issued.totalAmount,
    };
  }

  async syncClaimStatus(
    claimNumber: string,
    gatewayStatus: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED',
  ): Promise<void> {
    if (!this.prisma.isConnected) return;
    const claim = await this.prisma.insuranceClaims.findFirst({
      where: { claim_number: claimNumber },
    });
    if (!claim) return;

    if (gatewayStatus === 'SUBMITTED') {
      if (claim.status === 'DRAFT') {
        await this.finance.transitionClaim(claim.id, {
          status: 'SUBMITTED',
          actorUserId: claim.created_by,
        });
      }
      return;
    }

    if (gatewayStatus === 'REJECTED') {
      await this.finance.transitionClaim(claim.id, {
        status: 'DENIED',
        denialReason: 'Denied by insurer',
        actorUserId: claim.created_by,
      });
      return;
    }

    // ACCEPTED — approve claim amounts; do NOT mark invoice PAID without payment
    await this.finance.transitionClaim(claim.id, {
      status: 'APPROVED',
      amountApproved: claim.amount_claimed.toString(),
      actorUserId: claim.created_by,
    });
  }

  /** Server quote for a visit payload — authoritative total for UI display. */
  async quoteVisit(input: {
    consultCount?: number;
    labCount?: number;
    medCount?: number;
    extraServiceIds?: string[];
  }) {
    await this.ensureFeeSchedule();
    const baseCounts =
      (input.consultCount ?? 0) +
      (input.labCount ?? 0) +
      (input.medCount ?? 0);
    const base =
      baseCounts > 0
        ? await this.finance.quoteVisitLines({
            consultCount: input.consultCount,
            labCount: input.labCount,
            medCount: input.medCount,
          })
        : {
            lines: [] as Array<{
              serviceId: string;
              serviceCode: string;
              description: string;
              quantity: string;
              unitPrice: string;
              totalPrice: string;
            }>,
            subtotal: '0',
            discount: '0',
            tax: '0',
            totalAmount: '0',
          };

    const extraIds = [...new Set(input.extraServiceIds ?? [])];
    if (!extraIds.length) return base;

    const extras = await this.prisma.services.findMany({
      where: { id: { in: extraIds }, is_active: true },
    });
    const extraLines = extras.map((s) => ({
      serviceId: s.id,
      serviceCode: s.service_code,
      description: s.service_name,
      quantity: '1',
      unitPrice: s.standard_price.toString(),
      totalPrice: s.standard_price.toString(),
    }));
    const merged = [...base.lines, ...extraLines];
    const totals = calculateInvoiceTotals({ lines: merged });
    return {
      lines: merged.map((line, idx) => ({
        ...line,
        quantity: totals.lines[idx].quantity,
        unitPrice: totals.lines[idx].unitPrice,
        totalPrice: totals.lines[idx].totalPrice,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
    };
  }

  /** Create a draft consultation-fee invoice (no journal until issued). */
  async createConsultFeeDraft(input: {
    mrn: string;
    patientName: string;
    actorUserId: string;
    visitId: string;
  }): Promise<{
    invoiceId: string;
    invoiceNumber: string;
    totalAmount: string;
  }> {
    if (!this.billingRepo.isConnected()) {
      throw new NotFoundException('Database required for billing');
    }
    await this.ensureFeeSchedule();
    const patient = await this.prisma.patients.findUnique({
      where: { patient_number: input.mrn },
    });
    if (!patient || patient.deleted_at) {
      throw new NotFoundException(
        `Patient ${input.mrn} not found — register the patient before billing`,
      );
    }
    const quote = await this.finance.quoteVisitLines({ consultCount: 1 });
    if (!quote.lines.length) {
      throw new BadRequestException('Consultation service is not configured');
    }
    const invoice = await this.finance.createInvoice({
      patientId: patient.id,
      notes: `Consult fee · visit ${input.visitId} · ${input.patientName}`,
      lines: quote.lines.map((l) => ({
        serviceId: l.serviceId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
      actorUserId: input.actorUserId,
    });
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
    };
  }

  /**
   * Issue a draft invoice (if needed) and record cash/M-Pesa payment with
   * allocation + GL journals. Optionally apply a discount while still DRAFT.
   * Syncs linked triage consult-fee visits back to CHECKED_IN when paid.
   */
  async collectOnInvoice(input: {
    invoiceId: string;
    mode?: 'CASH' | 'MPESA';
    paymentMethodId?: string;
    amount?: string | number;
    discount?: string | number;
    actorUserId: string;
    transactionReference?: string;
    mpesaReceipt?: string;
    notes?: string;
  }): Promise<{
    invoiceId: string;
    invoiceNumber: string;
    paymentId: string;
    totalAmount: string;
    outstanding: string;
    status: string;
  }> {
    if (!this.billingRepo.isConnected()) {
      throw new NotFoundException('Database required for billing');
    }
    await this.ensureFeeSchedule();

    let invoice = await this.finance.getInvoice(input.invoiceId);

    if (
      invoice.status === 'DRAFT' &&
      input.discount !== undefined &&
      input.discount !== null &&
      String(input.discount) !== ''
    ) {
      invoice = await this.finance.updateDraftInvoice(input.invoiceId, {
        discount: input.discount,
        actorUserId: input.actorUserId,
      });
    }

    if (invoice.status === 'DRAFT') {
      invoice = await this.finance.issueInvoice(
        input.invoiceId,
        input.actorUserId,
      );
    }
    if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)) {
      if (invoice.status === 'PAID') {
        await this.syncVisitAfterConsultFeePayment(invoice.id, {
          paymentChannel: input.mode ?? 'CASH',
          mpesaReceipt: input.mpesaReceipt,
        });
        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          paymentId: '',
          totalAmount: invoice.totalAmount,
          outstanding: '0.00',
          status: invoice.status,
        };
      }
      throw new BadRequestException(
        `Invoice ${invoice.invoiceNumber} cannot be collected (status ${invoice.status})`,
      );
    }

    let methodId = input.paymentMethodId;
    if (!methodId) {
      const methodCode = input.mode === 'MPESA' ? 'MPESA' : 'CASH';
      const method = await this.prisma.paymentMethods.findUnique({
        where: { method_code: methodCode },
      });
      if (!method) {
        throw new BadRequestException(
          `Payment method ${methodCode} is not configured`,
        );
      }
      methodId = method.id;
    }

    const ref =
      input.transactionReference || input.mpesaReceipt || undefined;
    if (ref) {
      const dup = await this.prisma.payments.findFirst({
        where: { transaction_reference: ref, status: 'COMPLETED' },
      });
      if (dup) {
        await this.syncVisitAfterConsultFeePayment(invoice.id, {
          paymentChannel: input.mode ?? 'CASH',
          mpesaReceipt: input.mpesaReceipt,
        });
        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          paymentId: dup.id,
          totalAmount: invoice.totalAmount,
          outstanding: invoice.outstanding,
          status: invoice.status,
        };
      }
    }

    const outstanding = Number(invoice.outstanding ?? invoice.totalAmount);
    const payAmount =
      input.amount !== undefined && input.amount !== null && input.amount !== ''
        ? Number(input.amount)
        : outstanding;
    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (payAmount > outstanding + 0.001) {
      throw new BadRequestException(
        `Payment KES ${payAmount} exceeds outstanding KES ${outstanding}`,
      );
    }

    const method = await this.prisma.paymentMethods.findUnique({
      where: { id: methodId },
    });
    const channel =
      method?.method_code === 'MPESA'
        ? 'MPESA'
        : ((input.mode as 'CASH' | 'MPESA' | undefined) ?? 'CASH');

    const payment = await this.finance.createPayment({
      patientId: invoice.patientId,
      amount: payAmount,
      paymentMethodId: methodId,
      transactionReference: ref,
      notes:
        input.notes?.trim() ||
        (channel === 'MPESA'
          ? `M-Pesa collection for ${invoice.invoiceNumber}`
          : `Cash collection for ${invoice.invoiceNumber}`),
      allocateToInvoiceId: invoice.id,
      actorUserId: input.actorUserId,
    });

    const refreshed = await this.finance.getInvoice(invoice.id);
    await this.syncVisitAfterConsultFeePayment(invoice.id, {
      paymentChannel: channel,
      mpesaReceipt: input.mpesaReceipt,
    });

    return {
      invoiceId: refreshed.id,
      invoiceNumber: refreshed.invoiceNumber,
      paymentId: payment.id,
      totalAmount: refreshed.totalAmount,
      outstanding: refreshed.outstanding,
      status: refreshed.status,
    };
  }

  /** After consult-fee invoice is paid, return patient to triage queue. */
  private async syncVisitAfterConsultFeePayment(
    invoiceId: string,
    meta: { paymentChannel: 'CASH' | 'MPESA'; mpesaReceipt?: string },
  ): Promise<void> {
    const rows = await this.prisma.outpatientVisits.findMany({
      where: { stage: 'AWAITING_PAYMENT' },
      take: 300,
    });
    const now = new Date().toISOString();
    for (const row of rows) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const billing = (payload.billing ?? {}) as Record<string, unknown>;
      if (billing.invoiceId !== invoiceId) continue;
      if (billing.consultFeeStatus === 'PAID') continue;

      const amount = Number(billing.consultFeeAmount ?? billing.total ?? 0);
      await this.prisma.outpatientVisits.update({
        where: { id: row.id },
        data: {
          stage: 'CHECKED_IN',
          payload: {
            ...payload,
            billing: {
              ...billing,
              consultFeeStatus: 'PAID',
              consultFeePaidAt: now,
              consultFeeAmount: amount,
              paymentChannel: meta.paymentChannel,
              mpesaReceipt: meta.mpesaReceipt ?? billing.mpesaReceipt,
            },
          } as Prisma.InputJsonValue,
        },
      });
    }
  }
}
