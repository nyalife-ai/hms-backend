/**
 * Prisma billing repository — fee schedule, settlement, claim sync, M-Pesa checkout.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type {
  CreateMpesaTransactionInput,
  CreateReceiptInput,
  IBillingRepository,
  MpesaTransactionRow,
  ReceiptPatientRow,
  ReceiptRow,
  SettleVisitInput,
  SettleVisitResult,
  UpdateMpesaTransactionInput,
  CheckoutVisitRow,
} from './billing.repository.interface';

@Injectable()
export class PrismaBillingRepository implements IBillingRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public isConnected(): boolean {
    return this.prisma.isConnected;
  }

  public async findActiveServicePrices(codes: string[]) {
    return this.prisma.services.findMany({
      where: {
        service_code: { in: codes },
        is_active: true,
      },
      select: { service_code: true, standard_price: true },
    });
  }

  public async ensureFeeScheduleSeed(): Promise<void> {
    if (!this.prisma.isConnected) return;
    const { ensureBillingFoundation } = await import(
      '../finance/ensure-foundation'
    );
    await ensureBillingFoundation(this.prisma);
  }

  public async findPatientByMrn(mrn: string) {
    return this.prisma.patients.findUnique({
      where: { patient_number: mrn },
      select: { id: true, patient_number: true },
    });
  }

  public async countInvoices(): Promise<number> {
    return this.prisma.invoices.count();
  }

  public async settleVisit(input: SettleVisitInput): Promise<SettleVisitResult> {
    await this.ensureFeeScheduleSeed();
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patients.findUnique({
        where: { patient_number: input.mrn },
        select: { id: true, patient_number: true },
      });
      if (!patient) {
        throw new Error(
          `Patient ${input.mrn} not found — register the patient before billing`,
        );
      }

      const seq = await tx.invoices.count();
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(seq + 1).padStart(4, '0')}`;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(today);
      due.setDate(due.getDate() + 14);

      const invoice = await tx.invoices.create({
        data: {
          invoice_number: invoiceNumber,
          patient_id: patient.id,
          invoice_date: today,
          due_date: due,
          subtotal: input.total,
          total_amount: input.total,
          status:
            input.mode === 'CASH' || input.mode === 'MPESA' ? 'PAID' : 'ISSUED',
          notes: input.diagnosis
            ? `Visit settlement · ${input.patientName} · ${input.diagnosis}`
            : `Visit settlement · ${input.patientName}`,
          created_by: input.createdByUserId,
          billing_invoice_items_invoice_id: {
            create: input.lines.map((line) => ({
              description: line.description,
              quantity: 1,
              unit_price: line.amount,
              total_price: line.amount,
            })),
          },
        },
      });

      if (input.mode === 'CASH' || input.mode === 'MPESA') {
        const methodCode = input.mode === 'MPESA' ? 'MPESA' : 'CASH';
        const method = await tx.paymentMethods.findUnique({
          where: { method_code: methodCode },
        });
        const paySeq = await tx.payments.count();
        const payment = await tx.payments.create({
          data: {
            payment_number: `PAY-${new Date().getFullYear()}-${String(paySeq + 1).padStart(4, '0')}`,
            patient_id: patient.id,
            amount: input.total,
            payment_method_id: method?.id,
            transaction_reference:
              input.transactionReference || input.mpesaReceipt,
            status: 'COMPLETED',
            notes:
              input.mode === 'MPESA'
                ? `M-Pesa settlement for ${invoiceNumber}${input.mpesaReceipt ? ` · ${input.mpesaReceipt}` : ''}`
                : `Cash settlement for ${invoiceNumber}`,
            received_by: input.createdByUserId,
          },
        });
        await tx.paymentAllocations.create({
          data: {
            payment_id: payment.id,
            invoice_id: invoice.id,
            allocated_amount: input.total,
          },
        });
        return {
          invoiceId: invoice.id,
          invoiceNumber,
          paymentId: payment.id,
        };
      }

      let policyId: string | undefined;
      if (input.providerId && input.policyNumber) {
        const policy = await tx.insurancePolicies.findFirst({
          where: {
            patient_id: patient.id,
            provider_id: input.providerId,
            policy_number: input.policyNumber,
          },
        });
        if (policy) {
          policyId = policy.id;
        } else {
          const created = await tx.insurancePolicies.create({
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
          policyId = created.id;
        }
      }

      const claimNumber =
        input.claimExternalId ||
        `CLM-${new Date().getFullYear()}-${String((await tx.insuranceClaims.count()) + 1).padStart(4, '0')}`;

      const claim = await tx.insuranceClaims.create({
        data: {
          claim_number: claimNumber,
          invoice_id: invoice.id,
          patient_id: patient.id,
          insurance_policy_id: policyId,
          amount_claimed: input.total,
          status: 'SUBMITTED',
          submission_date: new Date(),
          notes: input.claimExternalId
            ? `External ref: ${input.claimExternalId}`
            : undefined,
          created_by: input.createdByUserId,
        },
      });

      return {
        invoiceId: invoice.id,
        invoiceNumber,
        claimNumber: claim.claim_number,
        claimDbId: claim.id,
      };
    });
  }

  public async syncClaimStatus(
    claimNumber: string,
    gatewayStatus: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED',
  ): Promise<void> {
    if (!this.prisma.isConnected) return;
    const statusMap = {
      SUBMITTED: 'SUBMITTED',
      ACCEPTED: 'APPROVED',
      REJECTED: 'DENIED',
    } as const;
    await this.prisma.insuranceClaims.updateMany({
      where: { claim_number: claimNumber },
      data: {
        status: statusMap[gatewayStatus],
        denial_reason:
          gatewayStatus === 'REJECTED' ? 'Denied by insurer' : null,
      },
    });
    if (gatewayStatus === 'ACCEPTED') {
      const claim = await this.prisma.insuranceClaims.findFirst({
        where: { claim_number: claimNumber },
      });
      if (claim) {
        await this.prisma.insuranceClaims.update({
          where: { id: claim.id },
          data: { amount_approved: claim.amount_claimed, status: 'APPROVED' },
        });
        await this.prisma.invoices.update({
          where: { id: claim.invoice_id },
          data: { status: 'PAID' },
        });
      }
    }
  }

  public async findVisitForCheckout(
    visitId: string,
  ): Promise<CheckoutVisitRow | null> {
    return this.prisma.outpatientVisits.findUnique({ where: { id: visitId } });
  }

  public async updateVisitCheckout(
    visitId: string,
    data: { stage: string; payload: unknown },
  ): Promise<void> {
    await this.prisma.outpatientVisits.update({
      where: { id: visitId },
      data: {
        stage: data.stage,
        payload: data.payload as Prisma.InputJsonValue,
      },
    });
  }

  public async createMpesaTransaction(
    input: CreateMpesaTransactionInput,
  ): Promise<MpesaTransactionRow> {
    return this.prisma.mpesaTransactions.create({
      data: {
        checkout_request_id: input.checkoutRequestId,
        merchant_request_id: input.merchantRequestId,
        phone: input.phone,
        amount: input.amount,
        account_reference: input.accountReference,
        description: input.description,
        status: input.status ?? 'PENDING',
        visit_id: input.visitId,
        patient_id: input.patientId,
        source: input.source,
        initiated_by: input.initiatedBy,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  public async findMpesaById(id: string): Promise<MpesaTransactionRow | null> {
    return this.prisma.mpesaTransactions.findUnique({ where: { id } });
  }

  public async findMpesaByCheckoutRequestId(
    checkoutRequestId: string,
  ): Promise<MpesaTransactionRow | null> {
    return this.prisma.mpesaTransactions.findUnique({
      where: { checkout_request_id: checkoutRequestId },
    });
  }

  public async updateMpesaTransaction(
    id: string,
    data: UpdateMpesaTransactionInput,
  ): Promise<MpesaTransactionRow> {
    return this.prisma.mpesaTransactions.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.resultCode !== undefined
          ? { result_code: data.resultCode }
          : {}),
        ...(data.resultDesc !== undefined
          ? { result_desc: data.resultDesc }
          : {}),
        ...(data.mpesaReceiptNumber !== undefined
          ? { mpesa_receipt_number: data.mpesaReceiptNumber }
          : {}),
        ...(data.checkoutRequestId !== undefined
          ? { checkout_request_id: data.checkoutRequestId }
          : {}),
        ...(data.merchantRequestId !== undefined
          ? { merchant_request_id: data.merchantRequestId }
          : {}),
        ...(data.payload !== undefined
          ? { payload: data.payload as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  public async claimMpesaPending(
    id: string,
    data: UpdateMpesaTransactionInput,
  ): Promise<MpesaTransactionRow | null> {
    // Claim only rows still waiting for customer/callback (PENDING + no result yet).
    // Do not require status=FINALIZING — legacy CHECK rejects that value.
    const result = await this.prisma.mpesaTransactions.updateMany({
      where: { id, status: 'PENDING', result_code: null },
      data: {
        ...(data.status !== undefined
          ? { status: data.status }
          : {}),
        ...(data.resultCode !== undefined
          ? { result_code: data.resultCode }
          : {}),
        ...(data.resultDesc !== undefined
          ? { result_desc: data.resultDesc }
          : {}),
        ...(data.mpesaReceiptNumber !== undefined
          ? { mpesa_receipt_number: data.mpesaReceiptNumber }
          : {}),
        ...(data.checkoutRequestId !== undefined
          ? { checkout_request_id: data.checkoutRequestId }
          : {}),
        ...(data.merchantRequestId !== undefined
          ? { merchant_request_id: data.merchantRequestId }
          : {}),
        ...(data.payload !== undefined
          ? { payload: data.payload as Prisma.InputJsonValue }
          : {}),
      },
    });
    if (result.count === 0) return null;
    return this.findMpesaById(id);
  }

  public async findBillingAlertUserIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: {
        deleted_at: null,
        is_active: true,
        core_user_roles_user_id: {
          some: {
            role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] } },
          },
        },
      },
      select: { id: true },
      take: 50,
    });
    return rows.map((r) => r.id);
  }

  public async findReceiptByMpesaTxId(
    mpesaTxId: string,
  ): Promise<ReceiptRow | null> {
    return this.prisma.receipts.findFirst({
      where: { mpesa_transaction_id: mpesaTxId },
    });
  }

  public async findReceiptById(id: string): Promise<ReceiptRow | null> {
    return this.prisma.receipts.findUnique({ where: { id } });
  }

  public async countReceipts(): Promise<number> {
    return this.prisma.receipts.count();
  }

  public async createReceipt(input: CreateReceiptInput): Promise<ReceiptRow> {
    return this.prisma.receipts.create({
      data: {
        receipt_number: input.receiptNumber,
        patient_id: input.patientId,
        visit_id: input.visitId,
        invoice_id: input.invoiceId,
        payment_id: input.paymentId,
        mpesa_transaction_id: input.mpesaTransactionId,
        channel: input.channel,
        amount: input.amount,
        issued_by: input.issuedBy,
        line_items: input.lineItems as Prisma.InputJsonValue,
        meta: input.meta as Prisma.InputJsonValue,
      },
    });
  }

  public async findPatientForReceipt(
    patientId: string,
  ): Promise<ReceiptPatientRow | null> {
    const patient = await this.prisma.patients.findUnique({
      where: { id: patientId },
      include: { user: { include: { core_profiles_user_id: true } } },
    });
    if (!patient) return null;
    const profile = patient.user.core_profiles_user_id[0];
    return {
      patient_number: patient.patient_number,
      profile: profile
        ? {
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone: profile.phone,
          }
        : null,
    };
  }
}
