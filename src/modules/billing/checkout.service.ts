/**
 * Checkout orchestration — M-Pesa STK + receipt; persistence via IBillingRepository.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Visit } from '../visits/visit.types';
import { BillingSettlementService } from './billing-settlement.service';
import { loadMpesaConfigFromEnv, MpesaClient } from './mpesa.client';
import { PharmacyDispenseService } from './pharmacy-dispense.service';
import {
  BILLING_REPOSITORY,
  type IBillingRepository,
  type MpesaTransactionRow,
} from './repositories/billing.repository.interface';

export type CheckoutSource = 'RECEPTION' | 'PHARMACY';
export type BillLine = { description: string; amount: number };

@Injectable()
export class CheckoutService {
  private client: MpesaClient;

  constructor(
    private readonly config: ConfigService,
    @Inject(BILLING_REPOSITORY) private readonly billingRepo: IBillingRepository,
    private readonly billing: BillingSettlementService,
    private readonly dispense: PharmacyDispenseService,
  ) {
    this.client = new MpesaClient(loadMpesaConfigFromEnv(process.env));
  }

  private refreshClient(): void {
    const publicUrl = (
      this.config.get<string>('PUBLIC_URL') ||
      process.env.PUBLIC_URL ||
      'http://localhost:4000'
    ).replace(/\/$/, '');
    this.client = new MpesaClient({
      consumerKey: (
        this.config.get<string>('MPESA_CONSUMER_KEY') ||
        process.env.MPESA_CONSUMER_KEY ||
        ''
      ).trim(),
      consumerSecret: (
        this.config.get<string>('MPESA_CONSUMER_SECRET') ||
        process.env.MPESA_CONSUMER_SECRET ||
        ''
      ).trim(),
      shortcode: (
        this.config.get<string>('MPESA_SHORTCODE') ||
        process.env.MPESA_SHORTCODE ||
        '174379'
      ).trim(),
      passkey: (
        this.config.get<string>('MPESA_PASSKEY') ||
        process.env.MPESA_PASSKEY ||
        ''
      ).trim(),
      callbackUrl: (
        this.config.get<string>('MPESA_CALLBACK_URL') ||
        process.env.MPESA_CALLBACK_URL ||
        `${publicUrl}/billing/mpesa/callback`
      ).trim(),
      env:
        (this.config.get<string>('MPESA_ENV') || process.env.MPESA_ENV || 'sandbox')
          .toLowerCase() === 'production'
          ? 'production'
          : 'sandbox',
      transactionType: (
        this.config.get<string>('MPESA_TRANSACTION_TYPE') ||
        process.env.MPESA_TRANSACTION_TYPE ||
        'CustomerPayBillOnline'
      ).trim(),
    });
  }

  mode(): 'live' | 'sandbox-sim' {
    this.refreshClient();
    return this.client.configured ? 'live' : 'sandbox-sim';
  }

  private requireDb(): void {
    if (!this.billingRepo.isConnected()) {
      throw new ServiceUnavailableException('Database required for checkout');
    }
  }

  private async loadVisit(visitId: string): Promise<Visit> {
    const row = await this.billingRepo.findVisitForCheckout(visitId);
    if (!row) throw new NotFoundException(`Visit ${visitId} not found`);
    const payload = (row.payload ?? {}) as {
      payment?: Visit['payment'];
      labOrder?: Visit['labOrder'];
      prescriptions?: Visit['prescriptions'];
      diagnosis?: string;
      doctorName?: string;
      billing?: Visit['billing'];
      pharmacy?: Visit['pharmacy'];
    };
    return {
      id: row.id,
      patientName: row.patient_name,
      mrn: row.mrn,
      age: row.age,
      gender: row.gender === 'Female' ? 'Female' : 'Male',
      phone: row.phone,
      firstVisit: row.first_visit,
      stage: row.stage as Visit['stage'],
      checkedInAt: row.checked_in_at.toISOString(),
      payment: payload.payment ?? { method: 'CASH' },
      labOrder: payload.labOrder,
      prescriptions: payload.prescriptions,
      diagnosis: payload.diagnosis,
      doctorName: payload.doctorName,
      billing: payload.billing,
      pharmacy: payload.pharmacy,
    };
  }

  private async visitLines(visit: Visit): Promise<BillLine[]> {
    const fees = await this.billing.getFeeSchedule();
    return [
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
  }

  async initiateStk(input: {
    visitId: string;
    phone: string;
    source: CheckoutSource;
    actorUserId: string;
  }) {
    this.requireDb();
    this.refreshClient();
    const visit = await this.loadVisit(input.visitId);

    if (visit.billing?.receiptId && visit.stage !== 'AWAITING_PAYMENT') {
      throw new BadRequestException('This visit is already paid and receipted.');
    }

    const claimRejected =
      visit.stage === 'CLAIM_SUBMITTED' &&
      visit.billing?.claimStatus === 'REJECTED';
    const consultFeeDue = visit.stage === 'AWAITING_PAYMENT';
    const ready =
      visit.stage === 'READY_FOR_BILLING' || claimRejected || consultFeeDue;
    if (!ready) {
      throw new BadRequestException(
        'Visit must be ready for billing (or awaiting consultation-fee payment) before M-Pesa checkout.',
      );
    }
    if (
      visit.payment.method === 'INSURANCE' &&
      visit.stage === 'READY_FOR_BILLING' &&
      !claimRejected
    ) {
      throw new BadRequestException(
        'This visit is on insurance — submit a claim instead of M-Pesa.',
      );
    }

    const fees = await this.billing.getFeeSchedule();
    const lines = consultFeeDue
      ? [
          {
            description: 'Consultation',
            amount: visit.billing?.consultFeeAmount ?? fees.consult,
          },
        ]
      : await this.visitLines(visit);
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const phone = MpesaClient.normalizePhone(input.phone);
    const accountReference =
      visit.mrn.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'NYALIFE';

    const patient = await this.billingRepo.findPatientByMrn(visit.mrn);

    let checkoutRequestId: string;
    let merchantRequestId: string | undefined;
    let simulated = false;

    if (this.client.configured) {
      const stk = await this.client.stkPush({
        phone,
        amount: total,
        accountReference,
        description: consultFeeDue ? 'NyaLife consult fee' : 'NyaLife bill',
      });
      checkoutRequestId = stk.CheckoutRequestID;
      merchantRequestId = stk.MerchantRequestID;
    } else {
      simulated = true;
      checkoutRequestId = `SIM-${Date.now().toString(36).toUpperCase()}`;
      merchantRequestId = `SIM-MR-${Date.now().toString(36).toUpperCase()}`;
    }

    const tx = await this.billingRepo.createMpesaTransaction({
      checkoutRequestId,
      merchantRequestId,
      phone,
      amount: total,
      accountReference,
      description: consultFeeDue
        ? 'Consultation fee'
        : input.source === 'PHARMACY'
          ? 'Pharmacy dispense'
          : 'Outpatient bill',
      visitId: visit.id,
      patientId: patient?.id,
      source: input.source,
      initiatedBy: input.actorUserId,
      payload: {
        lines,
        patientName: visit.patientName,
        mrn: visit.mrn,
        simulated,
        purpose: consultFeeDue ? 'CONSULT_FEE' : 'VISIT_SETTLEMENT',
        invoiceId: visit.billing?.invoiceId,
      },
    });

    return {
      ok: true,
      mode: simulated ? ('sandbox-sim' as const) : ('live' as const),
      checkoutId: tx.id,
      checkoutRequestId,
      phone,
      amount: total,
      message: simulated
        ? 'Sandbox simulation — payment auto-completes in ~8s (add MPESA_* keys for real STK).'
        : 'STK Push sent — ask the patient to enter their M-Pesa PIN.',
    };
  }

  async getStatus(checkoutId: string) {
    this.requireDb();
    this.refreshClient();
    const tx = await this.billingRepo.findMpesaById(checkoutId);
    if (!tx) throw new NotFoundException('Checkout not found');

    if (tx.status === 'SUCCESS' || tx.status === 'FAILED' || tx.status === 'CANCELLED') {
      const receipt = await this.billingRepo.findReceiptByMpesaTxId(tx.id);
      return this.toStatusPayload(tx, receipt?.id);
    }

    const payload = (tx.payload ?? {}) as {
      simulated?: boolean;
      lines?: BillLine[];
    };

    if (payload.simulated) {
      if (Date.now() - tx.created_at.getTime() > 8_000) {
        return this.finalizeSuccess(tx.id, {
          mpesaReceipt: `SIM${Date.now().toString(36).toUpperCase()}`,
          resultDesc: 'Sandbox simulation success',
        });
      }
      return this.toStatusPayload(tx);
    }

    if (this.client.configured) {
      try {
        const q = await this.client.stkQuery(tx.checkout_request_id);
        const code = String(q.ResultCode ?? '');
        if (code === '0') {
          return this.finalizeSuccess(tx.id, {
            resultDesc:
              q.ResultDesc || 'The service request is processed successfully.',
          });
        }
        if (code && q.ResponseCode === '0') {
          const updated = await this.billingRepo.updateMpesaTransaction(tx.id, {
            status: code === '1032' ? 'CANCELLED' : 'FAILED',
            resultCode: code,
            resultDesc: q.ResultDesc || q.ResponseDescription,
          });
          return this.toStatusPayload(updated);
        }
      } catch {
        // pending while customer enters PIN
      }
    }

    const demoMs = Number(process.env.MPESA_DEMO_AUTO_CONFIRM_MS || 0);
    if (demoMs > 0 && Date.now() - tx.created_at.getTime() > demoMs) {
      return this.finalizeSuccess(tx.id, {
        mpesaReceipt: `DEMO${Date.now().toString(36).toUpperCase()}`,
        resultDesc: 'Demo auto-confirm',
      });
    }

    return this.toStatusPayload(tx);
  }

  async handleCallback(
    body: Record<string, unknown>,
    opts?: { secretHeader?: string },
  ) {
    this.requireDb();
    const requiredSecret = (
      this.config.get<string>('MPESA_CALLBACK_SECRET') ||
      process.env.MPESA_CALLBACK_SECRET ||
      ''
    ).trim();
    const env =
      this.config.get<string>('app.environment') ||
      process.env.NODE_ENV ||
      'development';
    if (requiredSecret) {
      if (!opts?.secretHeader || opts.secretHeader !== requiredSecret) {
        throw new BadRequestException('Invalid M-Pesa callback secret');
      }
    } else if (env === 'production') {
      throw new ServiceUnavailableException(
        'MPESA_CALLBACK_SECRET must be configured in production',
      );
    }

    const stk = (body.Body as { stkCallback?: Record<string, unknown> } | undefined)
      ?.stkCallback;
    if (!stk) return { ResultCode: 0, ResultDesc: 'Accepted' };

    const checkoutRequestId = String(stk.CheckoutRequestID || '');
    const resultCode = String(stk.ResultCode ?? '');
    const resultDesc = String(stk.ResultDesc || '');
    const meta = (
      stk.CallbackMetadata as { Item?: Array<{ Name: string; Value?: unknown }> }
    )?.Item;
    const receiptItem = meta?.find((i) => i.Name === 'MpesaReceiptNumber');
    const mpesaReceipt =
      receiptItem?.Value != null ? String(receiptItem.Value) : undefined;

    const tx = await this.billingRepo.findMpesaByCheckoutRequestId(
      checkoutRequestId,
    );
    if (!tx || tx.status === 'SUCCESS') {
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    if (resultCode === '0') {
      await this.finalizeSuccess(tx.id, { mpesaReceipt, resultDesc });
    } else {
      await this.billingRepo.updateMpesaTransaction(tx.id, {
        status: resultCode === '1032' ? 'CANCELLED' : 'FAILED',
        resultCode,
        resultDesc,
        payload: {
          ...((tx.payload as object) || {}),
          callback: body,
        },
      });
    }
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  async getReceipt(receiptId: string) {
    this.requireDb();
    const receipt = await this.billingRepo.findReceiptById(receiptId);
    if (!receipt) throw new NotFoundException('Receipt not found');
    const patient = await this.billingRepo.findPatientForReceipt(
      receipt.patient_id,
    );
    const profile = patient?.profile;
    const meta = (receipt.meta ?? {}) as Record<string, unknown>;
    return {
      id: receipt.id,
      receiptNumber: receipt.receipt_number,
      channel: receipt.channel,
      amount: Number(receipt.amount),
      issuedAt: receipt.issued_at.toISOString(),
      visitId: receipt.visit_id,
      invoiceId: receipt.invoice_id,
      paymentId: receipt.payment_id,
      lineItems: receipt.line_items as BillLine[],
      meta,
      patient: {
        mrn: patient?.patient_number || String(meta.mrn || ''),
        name: profile
          ? `${profile.first_name} ${profile.last_name}`
          : String(meta.patientName || 'Patient'),
        phone: profile?.phone || String(meta.phone || ''),
      },
      facility: {
        name: process.env.APP_NAME || 'NyaLife Clinic',
        location: process.env.SLADE_LOCATION_NAME || 'NyaLife Clinic',
      },
    };
  }

  private toStatusPayload(tx: MpesaTransactionRow, receiptId?: string | null) {
    return {
      ok: true,
      checkoutId: tx.id,
      status: tx.status as 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED',
      phone: tx.phone,
      amount: Number(tx.amount),
      checkoutRequestId: tx.checkout_request_id,
      mpesaReceipt: tx.mpesa_receipt_number,
      message: tx.result_desc,
      source: tx.source,
      receiptId: receiptId ?? undefined,
      paid: tx.status === 'SUCCESS',
    };
  }

  private async finalizeSuccess(
    txId: string,
    info: { mpesaReceipt?: string; resultDesc?: string },
  ) {
    const tx = await this.billingRepo.findMpesaById(txId);
    if (!tx) throw new NotFoundException('Checkout not found');
    if (tx.status === 'SUCCESS') {
      const existing = await this.billingRepo.findReceiptByMpesaTxId(tx.id);
      return this.toStatusPayload(tx, existing?.id);
    }
    if (!tx.visit_id) {
      throw new BadRequestException('Checkout is not linked to a visit');
    }

    const visit = await this.loadVisit(tx.visit_id);
    const payload = (tx.payload ?? {}) as {
      lines?: BillLine[];
      purpose?: string;
      invoiceId?: string;
    };
    const isConsultFee =
      visit.stage === 'AWAITING_PAYMENT' || payload.purpose === 'CONSULT_FEE';

    if (isConsultFee) {
      const invoiceId = payload.invoiceId || visit.billing?.invoiceId;
      if (!invoiceId) {
        throw new BadRequestException(
          'Consultation-fee checkout is missing a linked invoice',
        );
      }
      const paid = await this.billing.collectOnInvoice({
        invoiceId,
        mode: 'MPESA',
        actorUserId: tx.initiated_by,
        mpesaReceipt: info.mpesaReceipt,
        transactionReference: info.mpesaReceipt || tx.checkout_request_id,
      });
      const total = Number(paid.totalAmount ?? tx.amount);

      const seq = await this.billingRepo.countReceipts();
      const receiptNumber = `RCP-${new Date().getFullYear()}-${String(seq + 1).padStart(5, '0')}`;
      const patient = await this.billingRepo.findPatientByMrn(visit.mrn);
      if (!patient) throw new NotFoundException('Patient not found for receipt');

      const receipt = await this.billingRepo.createReceipt({
        receiptNumber,
        patientId: patient.id,
        visitId: visit.id,
        invoiceId: paid.invoiceId,
        paymentId: paid.paymentId || undefined,
        mpesaTransactionId: tx.id,
        channel: 'MPESA',
        amount: total,
        issuedBy: tx.initiated_by,
        lineItems: payload.lines?.length
          ? payload.lines
          : [{ description: 'Consultation', amount: total }],
        meta: {
          mpesaReceipt: info.mpesaReceipt,
          phone: tx.phone,
          source: tx.source,
          checkoutRequestId: tx.checkout_request_id,
          mrn: visit.mrn,
          patientName: visit.patientName,
          purpose: 'CONSULT_FEE',
        },
      });

      await this.billingRepo.updateMpesaTransaction(tx.id, {
        status: 'SUCCESS',
        resultCode: '0',
        resultDesc: info.resultDesc || 'Success',
        mpesaReceiptNumber: info.mpesaReceipt,
      });

      const row = await this.billingRepo.findVisitForCheckout(visit.id);
      if (!row) throw new NotFoundException(`Visit ${visit.id} not found`);
      const prev = (row.payload ?? {}) as Record<string, unknown>;
      const prevBilling = (prev.billing ?? {}) as Record<string, unknown>;
      await this.billingRepo.updateVisitCheckout(visit.id, {
        stage: 'CHECKED_IN',
        payload: {
          ...prev,
          billing: {
            ...prevBilling,
            total,
            mode: 'CASH',
            invoiceId: paid.invoiceId,
            invoiceNumber: paid.invoiceNumber,
            receiptId: receipt.id,
            receiptNumber: receipt.receipt_number,
            mpesaReceipt: info.mpesaReceipt,
            paymentChannel: 'MPESA',
            consultFeeStatus: 'PAID',
            consultFeeAmount: total,
            consultFeePaidAt: new Date().toISOString(),
          },
        },
      });

      const updatedTx = await this.billingRepo.findMpesaById(tx.id);
      if (!updatedTx) throw new NotFoundException('Checkout not found');
      return this.toStatusPayload(updatedTx, receipt.id);
    }

    const lines = payload.lines?.length
      ? payload.lines
      : await this.visitLines(visit);
    const stkTotal = Number(tx.amount);

    const settled = await this.billing.settleVisit({
      createdByUserId: tx.initiated_by,
      mrn: visit.mrn,
      patientName: visit.patientName,
      lines,
      total: stkTotal,
      mode: 'MPESA',
      mpesaReceipt: info.mpesaReceipt,
      transactionReference: info.mpesaReceipt || tx.checkout_request_id,
      diagnosis: visit.diagnosis,
    });
    const total = Number(settled.totalAmount ?? stkTotal);

    const seq = await this.billingRepo.countReceipts();
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(seq + 1).padStart(5, '0')}`;
    const patient = await this.billingRepo.findPatientByMrn(visit.mrn);
    if (!patient) throw new NotFoundException('Patient not found for receipt');

    const receipt = await this.billingRepo.createReceipt({
      receiptNumber,
      patientId: patient.id,
      visitId: visit.id,
      invoiceId: settled.invoiceId,
      paymentId: settled.paymentId,
      mpesaTransactionId: tx.id,
      channel: 'MPESA',
      amount: total,
      issuedBy: tx.initiated_by,
      lineItems: lines,
      meta: {
        mpesaReceipt: info.mpesaReceipt,
        phone: tx.phone,
        source: tx.source,
        checkoutRequestId: tx.checkout_request_id,
        mrn: visit.mrn,
        patientName: visit.patientName,
        diagnosis: visit.diagnosis,
      },
    });

    await this.billingRepo.updateMpesaTransaction(tx.id, {
      status: 'SUCCESS',
      resultCode: '0',
      resultDesc: info.resultDesc || 'Success',
      mpesaReceiptNumber: info.mpesaReceipt,
    });

    let pharmacyMeta = visit.pharmacy;
    if (visit.prescriptions?.length) {
      await this.dispense.dispenseForVisit({
        visitId: visit.id,
        lines: visit.prescriptions.map((p) => ({
          medication: p.medication,
          medicationId: p.medicationId,
        })),
        performedBy: tx.initiated_by,
      });
      pharmacyMeta = {
        dispensed: true,
        dispensedAt: new Date().toISOString(),
      };
    } else if (tx.source === 'PHARMACY') {
      pharmacyMeta = {
        dispensed: true,
        dispensedAt: new Date().toISOString(),
      };
    }

    const row = await this.billingRepo.findVisitForCheckout(visit.id);
    if (!row) throw new NotFoundException(`Visit ${visit.id} not found`);
    const prev = (row.payload ?? {}) as Record<string, unknown>;
    const nextPayload = {
      ...prev,
      billing: {
        total,
        mode: 'CASH',
        invoiceId: settled.invoiceId,
        invoiceNumber: settled.invoiceNumber,
        receiptId: receipt.id,
        receiptNumber: receipt.receipt_number,
        mpesaReceipt: info.mpesaReceipt,
        paymentChannel: 'MPESA',
      },
      pharmacy: pharmacyMeta ?? prev.pharmacy,
    };

    await this.billingRepo.updateVisitCheckout(visit.id, {
      stage: 'COMPLETED',
      payload: nextPayload,
    });

    const updatedTx = await this.billingRepo.findMpesaById(tx.id);
    if (!updatedTx) throw new NotFoundException('Checkout not found');
    return this.toStatusPayload(updatedTx, receipt.id);
  }
}
