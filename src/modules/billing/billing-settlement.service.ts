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
   * Authoritative OPD line pricing (catalog snapshot):
   * Lab → TestTypes.standard_price (fallback LAB service)
   * Medication → Medications.standard_selling_price (fallback MED)
   * Consultation → resolveConsultFeeService()
   */
  async priceVisitBillLines(input: {
    includeConsult: boolean;
    labTests?: Array<{ name: string }>;
    medications?: Array<{ medication: string; medicationId?: string }>;
    orderedExtras?: Array<{ id: string; name: string; unitPrice?: string | number }>;
  }): Promise<Array<{ description: string; amount: number; serviceId?: string }>> {
    await this.ensureFeeSchedule();
    const fees = await this.getFeeSchedule();
    const lines: Array<{ description: string; amount: number; serviceId?: string }> =
      [];

    const [labSvc, medSvc] = await Promise.all([
      this.prisma.services.findFirst({
        where: { service_code: 'LAB', is_active: true },
      }),
      this.prisma.services.findFirst({
        where: { service_code: 'MED', is_active: true },
      }),
    ]);

    if (input.includeConsult) {
      try {
        const consult = await this.finance.resolveConsultFeeService();
        lines.push({
          description: 'Consultation',
          amount: Number(consult.standardPrice),
          serviceId: consult.id,
        });
      } catch {
        lines.push({ description: 'Consultation', amount: fees.consult });
      }
    }

    for (const t of input.labTests ?? []) {
      const name = t.name?.trim();
      if (!name) continue;
      const tt = await this.prisma.testTypes.findFirst({
        where: {
          is_active: true,
          test_name: { equals: name, mode: 'insensitive' },
        },
        select: { standard_price: true },
      });
      const amount = tt
        ? Number(tt.standard_price)
        : Number(labSvc?.standard_price ?? fees.lab);
      lines.push({
        description: `Lab: ${name}`,
        amount: Number.isFinite(amount) && amount >= 0 ? amount : fees.lab,
        serviceId: labSvc?.id,
      });
    }

    for (const p of input.medications ?? []) {
      const name = p.medication?.trim();
      if (!name) continue;
      let price: number | null = null;
      if (p.medicationId) {
        const byId = await this.prisma.medications.findFirst({
          where: { id: p.medicationId, deleted_at: null },
          select: { standard_selling_price: true },
        });
        if (byId) price = Number(byId.standard_selling_price);
      }
      if (price === null) {
        const byName = await this.prisma.medications.findFirst({
          where: {
            deleted_at: null,
            medication_name: { equals: name, mode: 'insensitive' },
          },
          select: { standard_selling_price: true },
        });
        if (byName) price = Number(byName.standard_selling_price);
      }
      const amount =
        price !== null && Number.isFinite(price) && price >= 0
          ? price
          : Number(medSvc?.standard_price ?? fees.medication);
      lines.push({
        description: `Medication: ${name}`,
        amount,
        serviceId: medSvc?.id,
      });
    }

    for (const s of input.orderedExtras ?? []) {
      if (!s.id) continue;
      const row = await this.prisma.services.findFirst({
        where: { id: s.id, is_active: true },
        select: { id: true, service_name: true, standard_price: true },
      });
      if (!row) continue;
      lines.push({
        description: row.service_name || s.name,
        amount: Number(row.standard_price),
        serviceId: row.id,
      });
    }

    return lines;
  }

  /**
   * Authoritative billing tax rate from `billing.tax_rates` (not Admin Settings `tax_rate`).
   * `tax_enabled` may disable tax application entirely.
   */
  private async resolveDefaultTaxRateId(): Promise<string | undefined> {
    try {
      const enabledRow = await this.prisma.settings.findUnique({
        where: { key: 'tax_enabled' },
      });
      if (enabledRow) {
        const v = enabledRow.value.trim().toLowerCase();
        if (['false', '0', 'no', 'off'].includes(v)) return undefined;
      }
      const rate = await this.prisma.taxRates.findFirst({
        where: { is_active: true },
        orderBy: { created_at: 'asc' },
        select: { id: true, rate_percentage: true },
      });
      if (!rate || Number(rate.rate_percentage) === 0) return undefined;
      return rate.id;
    } catch {
      return undefined;
    }
  }

  /**
   * Tax-inclusive checkout amount for M-Pesa STK — must match settleVisit / invoice totals.
   */
  async resolveTaxInclusiveCharge(input: {
    lines: Array<{ description: string; amount: number }>;
    invoiceId?: string | null;
  }): Promise<{
    amount: number;
    subtotal: string;
    tax: string;
    totalAmount: string;
    taxRatePercentage: string | null;
    taxCode: string | null;
  }> {
    if (input.invoiceId) {
      const inv = await this.finance.getInvoice(input.invoiceId);
      const due =
        inv.status === 'DRAFT'
          ? Number(inv.totalAmount)
          : Number(inv.outstanding);
      if (!(due > 0)) {
        throw new BadRequestException('Invoice has no outstanding balance');
      }
      return {
        amount: due,
        subtotal: inv.subtotal,
        tax: inv.tax,
        totalAmount: inv.totalAmount,
        taxRatePercentage: null,
        taxCode: null,
      };
    }

    if (!input.lines.length) {
      throw new BadRequestException('Nothing to charge');
    }

    const taxRateId = await this.resolveDefaultTaxRateId();
    let taxRatePercentage: string | null = null;
    let taxCode: string | null = null;
    if (taxRateId) {
      const rate = await this.prisma.taxRates.findUnique({
        where: { id: taxRateId },
        select: { rate_percentage: true, tax_code: true, is_active: true },
      });
      if (rate?.is_active) {
        taxRatePercentage = rate.rate_percentage.toString();
        taxCode = rate.tax_code;
      }
    }

    const totals = calculateInvoiceTotals({
      lines: input.lines.map((l) => ({
        description: l.description,
        quantity: 1,
        unitPrice: l.amount,
      })),
      taxRatePercentage,
    });

    return {
      amount: Number(totals.totalAmount),
      subtotal: totals.subtotal,
      tax: totals.tax,
      totalAmount: totals.totalAmount,
      taxRatePercentage,
      taxCode,
    };
  }

  /**
   * Settle an OPD visit using formal invoices + journals.
   * When input.lines carry amounts, those are treated as server-priced
   * catalog snapshots (one invoice item per line). Otherwise falls back
   * to legacy flat LAB/MED fee-schedule counts.
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
      extraIds.length === 0 &&
      input.lines.length === 0
    ) {
      throw new BadRequestException(
        'Nothing to bill — no consultation, lab, medication, or service lines',
      );
    }

    const useCatalogLines =
      input.lines.length > 0 &&
      input.lines.every(
        (l) => Number.isFinite(Number(l.amount)) && Number(l.amount) >= 0,
      );

    let mergedLines: Array<{
      serviceId: string;
      description: string;
      quantity: string;
      unitPrice: string;
    }> = [];

    if (useCatalogLines) {
      const labSvc = await this.prisma.services.findFirst({
        where: { service_code: 'LAB', is_active: true },
      });
      const medSvc = await this.prisma.services.findFirst({
        where: { service_code: 'MED', is_active: true },
      });
      let consultId: string | undefined;
      try {
        consultId = (await this.finance.resolveConsultFeeService()).id;
      } catch {
        consultId = (
          await this.prisma.services.findFirst({
            where: { service_code: 'CONSULT', is_active: true },
            select: { id: true },
          })
        )?.id;
      }

      for (const line of input.lines) {
        const d = line.description.toLowerCase();
        let serviceId: string | undefined;
        if (d.startsWith('consultation')) serviceId = consultId;
        else if (d.startsWith('lab')) serviceId = labSvc?.id;
        else if (d.startsWith('medication') || d.startsWith('med'))
          serviceId = medSvc?.id;
        else {
          const byName = await this.prisma.services.findFirst({
            where: {
              is_active: true,
              service_name: {
                equals: line.description,
                mode: 'insensitive',
              },
            },
            select: { id: true },
          });
          serviceId = byName?.id ?? labSvc?.id ?? medSvc?.id ?? consultId;
        }
        if (!serviceId) {
          throw new BadRequestException(
            `No billing service mapped for line: ${line.description}`,
          );
        }
        mergedLines.push({
          serviceId,
          description: line.description,
          quantity: '1',
          unitPrice: String(line.amount),
        });
      }

      if (extraIds.length) {
        const already = new Set(mergedLines.map((l) => l.serviceId));
        const extras = await this.prisma.services.findMany({
          where: { id: { in: extraIds }, is_active: true },
        });
        for (const s of extras) {
          if (already.has(s.id)) continue;
          mergedLines.push({
            serviceId: s.id,
            description: s.service_name,
            quantity: '1',
            unitPrice: s.standard_price.toString(),
          });
        }
      }
    } else {
      const quote =
        consultCount + labCount + medCount > 0
          ? await this.finance.quoteVisitLines({
              consultCount,
              labCount,
              medCount,
            })
          : {
              lines: [] as Array<{
                serviceId: string;
                description: string;
                quantity: string;
                unitPrice: string;
              }>,
            };

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
      mergedLines = [...quote.lines, ...extraLines];
    }

    if (!mergedLines.length) {
      throw new BadRequestException(
        'Nothing to bill — fee schedule or services unavailable',
      );
    }
    // Validate totals (authoritative path still uses line unit prices)
    void calculateInvoiceTotals({ lines: mergedLines });

    const taxRateId = await this.resolveDefaultTaxRateId();

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
      taxRateId,
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
        skipDomainEvent: input.mode === 'MPESA',
        domainPayload: {
          purpose: 'VISIT_SETTLEMENT',
          invoiceId: issued.id,
          invoiceNumber: issued.invoiceNumber,
        },
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

  /** Server quote for a visit payload — authoritative total for UI display.
   * Uses the same billing tax-rate resolution as settleVisit so quotes match invoices.
   */
  async quoteVisit(input: {
    consultCount?: number;
    labCount?: number;
    medCount?: number;
    extraServiceIds?: string[];
  }) {
    await this.ensureFeeSchedule();
    const taxRateId = await this.resolveDefaultTaxRateId();
    let taxRatePercentage: string | null = null;
    let taxCode: string | null = null;
    if (taxRateId) {
      const rate = await this.prisma.taxRates.findUnique({
        where: { id: taxRateId },
        select: { rate_percentage: true, tax_code: true, is_active: true },
      });
      if (rate?.is_active) {
        taxRatePercentage = rate.rate_percentage.toString();
        taxCode = rate.tax_code;
      }
    }

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
            taxRateId,
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
            taxRatePercentage: null as string | null,
            taxCode: null as string | null,
          };

    const extraIds = [...new Set(input.extraServiceIds ?? [])];
    if (!extraIds.length) {
      return {
        ...base,
        taxRatePercentage:
          'taxRatePercentage' in base &&
          (base as { taxRatePercentage?: string | null }).taxRatePercentage !=
            null
            ? (base as { taxRatePercentage?: string | null }).taxRatePercentage
            : taxRatePercentage,
        taxCode:
          'taxCode' in base &&
          (base as { taxCode?: string | null }).taxCode != null
            ? (base as { taxCode?: string | null }).taxCode
            : taxCode,
      };
    }

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
    const totals = calculateInvoiceTotals({
      lines: merged,
      taxRatePercentage,
    });
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
      taxRatePercentage,
      taxCode,
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
    const taxRateId = await this.resolveDefaultTaxRateId();
    const quote = await this.finance.quoteVisitLines({
      consultCount: 1,
      taxRateId,
    });
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
      taxRateId,
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
    visitId?: string;
    purpose?: string;
    skipDomainEvent?: boolean;
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
      skipDomainEvent: input.skipDomainEvent,
      domainPayload: {
        visitId: input.visitId,
        purpose: input.purpose ?? 'INVOICE_COLLECTION',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      },
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
