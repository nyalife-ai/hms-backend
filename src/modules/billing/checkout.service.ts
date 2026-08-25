/**
 * Checkout orchestration — M-Pesa STK + receipt; persistence via IBillingRepository.
 */

import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDomainEventId } from '../../core/domain';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import type { Queue } from 'bull';
import type { Visit } from '../visits/visit.types';
import { BillingSettlementService } from './billing-settlement.service';
import {
  BILLING_PAYMENTS_QUEUE,
  BILLING_STK_JOB,
  type BillingStkJobData,
} from './billing-queue.constants';
import { loadMpesaConfigFromEnv, MpesaClient } from './mpesa.client';
import {
  appendTimeline,
  isRetryableStkError,
  isTerminalMpesaStatus,
  mapMpesaFailureReason,
  maskMpesaPhone,
  MPESA_STK_TIMEOUT_MS,
  placeholderCheckoutRequestId,
  statusUserMessage,
  type MpesaStage,
} from './mpesa-lifecycle';
import {
  isMpesaCallbackIpAllowed,
  resolveMpesaCallbackAllowlist,
} from './mpesa-callback-security';
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
  private readonly logger = new Logger(CheckoutService.name);
  private client: MpesaClient;

  constructor(
    private readonly config: ConfigService,
    @Inject(BILLING_REPOSITORY) private readonly billingRepo: IBillingRepository,
    private readonly billing: BillingSettlementService,
    private readonly dispense: PharmacyDispenseService,
    @InjectQueue(BILLING_PAYMENTS_QUEUE) private readonly paymentsQueue: Queue,
    private readonly events: EventEmitter2,
  ) {
    this.client = new MpesaClient(loadMpesaConfigFromEnv(process.env));
  }

  private refreshClient(): void {
    const publicUrl = (
      this.config.get<string>('PUBLIC_URL') ||
      process.env.PUBLIC_URL ||
      'http://localhost:4000'
    ).replace(/\/$/, '');
    const pick = (...keys: string[]): string => {
      for (const key of keys) {
        const v = this.config.get<string>(key) || process.env[key];
        if (v != null && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };
    const next = {
      consumerKey: pick('MPESA_CONSUMER_KEY'),
      consumerSecret: pick('MPESA_CONSUMER_SECRET'),
      shortcode: pick('MPESA_SHORTCODE') || '174379',
      passkey: pick('MPESA_PASSKEY'),
      callbackUrl: this.buildCallbackUrl(publicUrl),
      env: (pick('MPESA_ENV') || 'sandbox').toLowerCase() === 'production'
        ? ('production' as const)
        : ('sandbox' as const),
      transactionType:
        pick('MPESA_TRANSACTION_TYPE') || 'CustomerPayBillOnline',
    };
    // Reuse the same client instance so process-level OAuth cache stays warm.
    this.client.updateConfig(next);
  }

  /** Daraja cannot set custom headers — embed secret as query when configured. */
  private buildCallbackUrl(publicUrl: string): string {
    const base = (
      this.config.get<string>('MPESA_CALLBACK_URL') ||
      process.env.MPESA_CALLBACK_URL ||
      `${publicUrl}/billing/mpesa/callback`
    ).trim();
    const secret = (
      this.config.get<string>('MPESA_CALLBACK_SECRET') ||
      process.env.MPESA_CALLBACK_SECRET ||
      ''
    ).trim();
    if (!secret) return base;
    try {
      const url = new URL(base);
      if (!url.searchParams.has('secret')) {
        url.searchParams.set('secret', secret);
      }
      return url.toString();
    } catch {
      const join = base.includes('?') ? '&' : '?';
      return `${base}${join}secret=${encodeURIComponent(secret)}`;
    }
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
    const consultAlreadyPaid = visit.billing?.consultFeeStatus === 'PAID';
    const priced = await this.billing.priceVisitBillLines({
      includeConsult: !consultAlreadyPaid,
      labTests: visit.labOrder?.tests ?? [],
      medications: visit.prescriptions ?? [],
    });
    return priced.map((l) => ({
      description: l.description,
      amount: l.amount,
    }));
  }

  /**
   * Validate visit eligibility, persist QUEUED payment row (correlation id),
   * then enqueue STK. HTTP returns immediately with checkoutId — NOT success.
   * Worker calls {@link executeQueuedStk}.
   */
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
    if (!(total > 0)) {
      throw new BadRequestException(
        'Checkout amount must be greater than zero before M-Pesa STK',
      );
    }

    let phone: string;
    try {
      phone = MpesaClient.normalizePhone(input.phone);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error
          ? err.message
          : 'Invalid M-Pesa phone number',
      );
    }

    const accountReference =
      visit.mrn.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'NYALIFE';
    const patient = await this.billingRepo.findPatientByMrn(visit.mrn);
    const paymentId = randomUUID();
    const dedupeKey = `stk:${input.visitId}:${phone}:${total}`;
    const mode = this.mode();

    let payload: Record<string, unknown> = appendTimeline(
      {
        lines,
        patientName: visit.patientName,
        mrn: visit.mrn,
        simulated: mode === 'sandbox-sim',
        purpose: consultFeeDue ? 'CONSULT_FEE' : 'VISIT_SETTLEMENT',
        invoiceId: visit.billing?.invoiceId,
        correlationId: paymentId,
        phoneMasked: maskMpesaPhone(phone),
        mode,
      },
      'INITIATED',
      'Payment initiated from billing UI',
    );
    payload = appendTimeline(payload, 'QUEUED', 'Persisting QUEUED payment row');

    const tx = await this.billingRepo.createMpesaTransaction({
      checkoutRequestId: placeholderCheckoutRequestId(paymentId),
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
      status: 'QUEUED',
      payload: {
        ...payload,
        // Force id used in placeholder; Prisma generates id — replace after create.
        pendingPaymentId: paymentId,
      },
    });

    // Re-key placeholder with real DB id for uniqueness + correlation.
    const checkoutRequestPlaceholder = placeholderCheckoutRequestId(tx.id);
    payload = appendTimeline(
      {
        ...((tx.payload as object) || {}),
        correlationId: tx.id,
        pendingPaymentId: undefined,
      },
      'JOB_CREATED',
      'Enqueueing payment.stk_push job',
    );

    await this.billingRepo.updateMpesaTransaction(tx.id, {
      checkoutRequestId: checkoutRequestPlaceholder,
      payload,
    });

    this.logger.log(
      JSON.stringify({
        event: 'JOB_CREATED',
        paymentId: tx.id,
        visitId: visit.id,
        amount: total,
        phoneMasked: maskMpesaPhone(phone),
        status: 'QUEUED',
        stage: 'JOB_CREATED',
        mode,
        correlationId: tx.id,
      }),
    );

    const jobData: BillingStkJobData = {
      checkoutId: tx.id,
      visitId: input.visitId,
      phone,
      source: input.source,
      actorUserId: input.actorUserId,
      dedupeKey,
    };

    let jobId: string;
    try {
      await this.assertQueueReady();
      const job = await this.paymentsQueue.add(BILLING_STK_JOB, jobData, {
        jobId: `stk-${tx.id}`,
        attempts: 4,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      });
      jobId = String(job.id);
    } catch (err) {
      const reason = mapMpesaFailureReason({
        rawMessage:
          err instanceof Error
            ? err.message
            : 'Payment queue unavailable (Redis)',
      });
      await this.failPayment(tx.id, {
        resultCode: 'QUEUE_UNAVAILABLE',
        resultDesc: reason,
        stage: 'FAILED',
        notify: true,
      });
      throw new ServiceUnavailableException(reason);
    }

    return {
      ok: true,
      queued: true,
      paid: false,
      checkoutId: tx.id,
      paymentId: tx.id,
      jobId,
      status: 'QUEUED' as const,
      stage: 'JOB_CREATED' as const,
      phone,
      phoneMasked: maskMpesaPhone(phone),
      amount: total,
      mode,
      message: statusUserMessage('QUEUED'),
      correlationId: tx.id,
    };
  }

  /**
   * Worker entry — Daraja STK + move QUEUED → PROCESSING → PENDING (or FAILED).
   * Does not mark SUCCESS; that requires callback / stkQuery confirmation.
   */
  async executeQueuedStk(input: {
    checkoutId: string;
    visitId: string;
    phone: string;
    source: CheckoutSource;
    actorUserId: string;
  }) {
    this.requireDb();
    this.refreshClient();

    const existing = await this.billingRepo.findMpesaById(input.checkoutId);
    if (!existing) {
      throw new NotFoundException(`Checkout ${input.checkoutId} not found`);
    }
    if (isTerminalMpesaStatus(existing.status)) {
      this.logger.warn(
        JSON.stringify({
          event: 'JOB_SKIPPED_TERMINAL',
          paymentId: existing.id,
          status: existing.status,
          correlationId: existing.id,
        }),
      );
      return this.toStatusPayload(existing);
    }

    this.logger.log(
      JSON.stringify({
        event: 'JOB_PICKED_UP',
        paymentId: existing.id,
        visitId: input.visitId,
        phoneMasked: maskMpesaPhone(existing.phone),
        status: existing.status,
        stage: 'JOB_PICKED_UP',
        correlationId: existing.id,
      }),
    );

    let payload = appendTimeline(
      (existing.payload as Record<string, unknown>) || {},
      'JOB_PICKED_UP',
      'Worker picked up payment.stk_push',
    );
    payload = appendTimeline(payload, 'PROCESSING', 'Preparing Daraja STK');

    await this.billingRepo.updateMpesaTransaction(existing.id, {
      status: 'PROCESSING',
      payload,
    });

    const visit = await this.loadVisit(input.visitId);

    if (visit.billing?.receiptId && visit.stage !== 'AWAITING_PAYMENT') {
      await this.failPayment(existing.id, {
        resultCode: 'ALREADY_PAID',
        resultDesc: 'This visit is already paid and receipted.',
        stage: 'FAILED',
        notify: true,
      });
      throw new BadRequestException('This visit is already paid and receipted.');
    }

    const claimRejected =
      visit.stage === 'CLAIM_SUBMITTED' &&
      visit.billing?.claimStatus === 'REJECTED';
    const consultFeeDue = visit.stage === 'AWAITING_PAYMENT';
    const ready =
      visit.stage === 'READY_FOR_BILLING' || claimRejected || consultFeeDue;
    if (!ready) {
      const msg =
        'Visit must be ready for billing (or awaiting consultation-fee payment) before M-Pesa checkout.';
      await this.failPayment(existing.id, {
        resultCode: 'VISIT_NOT_READY',
        resultDesc: msg,
        stage: 'FAILED',
        notify: true,
      });
      throw new BadRequestException(msg);
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
    if (!(total > 0)) {
      const msg =
        'Checkout amount must be greater than zero before M-Pesa STK';
      await this.failPayment(existing.id, {
        resultCode: 'INVALID_AMOUNT',
        resultDesc: msg,
        stage: 'FAILED',
        notify: true,
      });
      throw new BadRequestException(msg);
    }

    let phone: string;
    try {
      phone = MpesaClient.normalizePhone(input.phone);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Invalid M-Pesa phone number';
      await this.failPayment(existing.id, {
        resultCode: 'INVALID_PHONE',
        resultDesc: mapMpesaFailureReason({ rawMessage: msg }),
        stage: 'FAILED',
        notify: true,
      });
      throw new BadRequestException(msg);
    }

    const accountReference =
      visit.mrn.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'NYALIFE';

    let checkoutRequestId: string;
    let merchantRequestId: string | undefined;
    let simulated = false;
    let darajaSafe: Record<string, unknown> | undefined;

    if (this.client.configured) {
      this.logger.log(
        JSON.stringify({
          event: 'DARAJA_REQUEST_STARTED',
          paymentId: existing.id,
          amount: total,
          phoneMasked: maskMpesaPhone(phone),
          stage: 'DARAJA_REQUEST_STARTED',
          correlationId: existing.id,
        }),
      );
      payload = appendTimeline(
        payload,
        'DARAJA_REQUEST_STARTED',
        'Calling Daraja STK Push API',
      );
      await this.billingRepo.updateMpesaTransaction(existing.id, { payload });

      try {
        const stk = await this.client.stkPush({
          phone,
          amount: total,
          accountReference,
          description: consultFeeDue ? 'NyaLife consult fee' : 'NyaLife bill',
        });
        checkoutRequestId = stk.CheckoutRequestID;
        merchantRequestId = stk.MerchantRequestID;
        darajaSafe = {
          merchantRequestId: stk.MerchantRequestID,
          checkoutRequestId: stk.CheckoutRequestID,
          responseCode: stk.ResponseCode,
          responseDescription: stk.ResponseDescription,
          customerMessage: stk.CustomerMessage,
        };
        this.logger.log(
          JSON.stringify({
            event: 'DARAJA_RESPONSE_RECEIVED',
            paymentId: existing.id,
            checkoutRequestId,
            responseCode: stk.ResponseCode,
            stage: 'DARAJA_RESPONSE_RECEIVED',
            correlationId: existing.id,
          }),
        );
      } catch (err) {
        const daraja = (
          err as Error & { daraja?: Record<string, unknown> }
        ).daraja;
        const reason = mapMpesaFailureReason({
          resultCode: daraja?.code ? String(daraja.code) : undefined,
          resultDesc: err instanceof Error ? err.message : String(err),
        });
        const failed = await this.failPayment(existing.id, {
          resultCode: daraja?.responseCode
            ? String(daraja.responseCode)
            : 'DARAJA_STK_FAILED',
          resultDesc: reason,
          stage: 'FAILED',
          notify: true,
          extraPayload: daraja ? { daraja } : undefined,
        });
        if (!isRetryableStkError(err)) {
          // Permanent — do not retry Bull job
          return this.toStatusPayload(failed);
        }
        throw err;
      }
    } else {
      simulated = true;
      checkoutRequestId = `SIM-${Date.now().toString(36).toUpperCase()}`;
      merchantRequestId = `SIM-MR-${Date.now().toString(36).toUpperCase()}`;
      this.logger.warn(
        JSON.stringify({
          event: 'SANDBOX_SIM',
          paymentId: existing.id,
          message:
            'MPESA_* credentials incomplete — simulating STK (no phone prompt)',
          correlationId: existing.id,
        }),
      );
    }

    payload = appendTimeline(
      {
        ...payload,
        lines,
        patientName: visit.patientName,
        mrn: visit.mrn,
        simulated,
        purpose: consultFeeDue ? 'CONSULT_FEE' : 'VISIT_SETTLEMENT',
        invoiceId: visit.billing?.invoiceId,
        daraja: darajaSafe,
      },
      'STK_SENT',
      simulated
        ? 'Sandbox simulation — no real STK prompt'
        : 'Daraja accepted STK request',
      darajaSafe,
    );
    payload = appendTimeline(
      payload,
      'WAITING_CALLBACK',
      'Waiting for customer PIN / Safaricom callback',
    );

    const updated = await this.billingRepo.updateMpesaTransaction(existing.id, {
      status: 'PENDING',
      checkoutRequestId,
      merchantRequestId,
      payload,
      resultDesc: simulated
        ? 'Sandbox simulation — awaiting auto-confirm'
        : 'STK Push sent — waiting for customer confirmation',
    });

    this.logger.log(
      JSON.stringify({
        event: 'JOB_COMPLETED',
        paymentId: updated.id,
        status: 'PENDING',
        stage: 'WAITING_CALLBACK',
        checkoutRequestId,
        simulated,
        correlationId: updated.id,
      }),
    );

    return {
      ok: true,
      paid: false,
      mode: simulated ? ('sandbox-sim' as const) : ('live' as const),
      checkoutId: updated.id,
      paymentId: updated.id,
      checkoutRequestId,
      phone,
      amount: total,
      status: 'PENDING' as const,
      stage: 'WAITING_CALLBACK' as const,
      message: simulated
        ? 'Sandbox simulation — payment auto-completes in ~8s (add complete MPESA_* keys for real STK).'
        : 'STK Push sent — ask the patient to enter their M-Pesa PIN.',
    };
  }

  /** Called by processor on terminal Bull failure (exhausted retries). */
  async markStkJobFailed(checkoutId: string, error: Error): Promise<void> {
    const tx = await this.billingRepo.findMpesaById(checkoutId);
    if (!tx || isTerminalMpesaStatus(tx.status) || tx.status === 'PENDING') {
      return;
    }
    const reason = mapMpesaFailureReason({ rawMessage: error.message });
    await this.failPayment(checkoutId, {
      resultCode: 'JOB_FAILED',
      resultDesc: reason,
      stage: 'JOB_FAILED',
      notify: true,
    });
  }

  async getStatus(checkoutId: string) {
    this.requireDb();
    this.refreshClient();
    const tx = await this.billingRepo.findMpesaById(checkoutId);
    if (!tx) throw new NotFoundException('Checkout not found');

    if (isTerminalMpesaStatus(tx.status) || tx.status === 'FINALIZING') {
      const receipt = await this.billingRepo.findReceiptByMpesaTxId(tx.id);
      return this.toStatusPayload(tx, receipt?.id);
    }

    const payload = (tx.payload ?? {}) as {
      simulated?: boolean;
      lines?: BillLine[];
      stage?: string;
      timeline?: unknown[];
    };

    if (tx.status === 'QUEUED' || tx.status === 'PROCESSING') {
      // Still in worker path — do not claim success.
      return this.toStatusPayload(tx);
    }

    if (payload.simulated && tx.status === 'PENDING') {
      if (Date.now() - tx.created_at.getTime() > 8_000) {
        return this.finalizeSuccess(tx.id, {
          mpesaReceipt: `SIM${Date.now().toString(36).toUpperCase()}`,
          resultDesc: 'Sandbox simulation success',
        });
      }
      return this.toStatusPayload(tx);
    }

    if (this.client.configured && tx.status === 'PENDING') {
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
            resultDesc: mapMpesaFailureReason({
              resultCode: code,
              resultDesc: q.ResultDesc || q.ResponseDescription,
            }),
            payload: appendTimeline(
              (tx.payload as Record<string, unknown>) || {},
              code === '1032' ? 'CANCELLED' : 'FAILED',
              q.ResultDesc || q.ResponseDescription || undefined,
            ),
          });
          if (code !== '1032') {
            await this.notifyPaymentFailure(updated);
          }
          return this.toStatusPayload(updated);
        }
      } catch (err) {
        this.logger.debug(
          JSON.stringify({
            event: 'STK_QUERY_PENDING',
            paymentId: tx.id,
            message: err instanceof Error ? err.message : String(err),
            correlationId: tx.id,
          }),
        );
      }
    }

    const demoMs = Number(process.env.MPESA_DEMO_AUTO_CONFIRM_MS || 0);
    const mpesaEnv = (
      this.config.get<string>('MPESA_ENV') ||
      process.env.MPESA_ENV ||
      'sandbox'
    ).toLowerCase();
    const appEnv = (
      this.config.get<string>('app.environment') ||
      process.env.NODE_ENV ||
      'development'
    ).toLowerCase();
    if (
      demoMs > 0 &&
      !this.client.configured &&
      mpesaEnv !== 'production' &&
      appEnv !== 'production' &&
      Date.now() - tx.created_at.getTime() > demoMs
    ) {
      return this.finalizeSuccess(tx.id, {
        mpesaReceipt: `DEMO${Date.now().toString(36).toUpperCase()}`,
        resultDesc: 'Demo auto-confirm (sandbox only)',
      });
    }

    if (
      tx.status === 'PENDING' &&
      Date.now() - tx.created_at.getTime() > MPESA_STK_TIMEOUT_MS
    ) {
      const updated = await this.billingRepo.updateMpesaTransaction(tx.id, {
        status: 'TIMEOUT',
        resultCode: 'TIMEOUT',
        resultDesc: statusUserMessage('TIMEOUT'),
        payload: appendTimeline(
          (tx.payload as Record<string, unknown>) || {},
          'TIMEOUT',
          'Customer did not complete payment within timeout',
        ),
      });
      await this.notifyPaymentFailure(updated);
      return this.toStatusPayload(updated);
    }

    return this.toStatusPayload(tx);
  }

  async handleCallback(
    body: Record<string, unknown>,
    opts?: { secretHeader?: string; secretQuery?: string; remoteIp?: string },
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
      const provided =
        (opts?.secretQuery || '').trim() || (opts?.secretHeader || '').trim();
      if (!provided || provided !== requiredSecret) {
        throw new BadRequestException('Invalid M-Pesa callback secret');
      }
    } else if (env === 'production') {
      throw new ServiceUnavailableException(
        'MPESA_CALLBACK_SECRET must be configured in production',
      );
    }

    const allowlist = resolveMpesaCallbackAllowlist(
      this.config.get<string>('MPESA_CALLBACK_ALLOWED_IPS') ||
        process.env.MPESA_CALLBACK_ALLOWED_IPS,
    );
    if (
      env === 'production' &&
      !isMpesaCallbackIpAllowed(opts?.remoteIp, allowlist)
    ) {
      throw new BadRequestException('Callback origin not allowed');
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
    const amountItem = meta?.find((i) => i.Name === 'Amount');
    const callbackAmount =
      amountItem?.Value != null ? Number(amountItem.Value) : null;

    const tx = await this.billingRepo.findMpesaByCheckoutRequestId(
      checkoutRequestId,
    );
    if (!tx || tx.status === 'SUCCESS') {
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    if (resultCode === '0') {
      if (
        callbackAmount != null &&
        Number.isFinite(callbackAmount) &&
        Math.abs(callbackAmount - Number(tx.amount)) > 0.009
      ) {
        await this.failPayment(tx.id, {
          resultCode: 'AMOUNT_MISMATCH',
          resultDesc: `Callback amount ${callbackAmount} does not match expected ${tx.amount}`,
          stage: 'FAILED',
          notify: true,
          extraPayload: { callback: body },
        });
        return { ResultCode: 0, ResultDesc: 'Accepted' };
      }
      const withTimeline = appendTimeline(
        (tx.payload as Record<string, unknown>) || {},
        'CALLBACK_RECEIVED',
        resultDesc || 'Safaricom callback success',
      );
      await this.billingRepo.updateMpesaTransaction(tx.id, {
        payload: withTimeline,
      });
      await this.finalizeSuccess(tx.id, { mpesaReceipt, resultDesc });
    } else {
      await this.failPayment(tx.id, {
        resultCode,
        resultDesc: mapMpesaFailureReason({
          resultCode,
          resultDesc,
        }),
        stage: resultCode === '1032' ? 'CANCELLED' : 'FAILED',
        status: resultCode === '1032' ? 'CANCELLED' : 'FAILED',
        notify: resultCode !== '1032',
        extraPayload: { callback: body },
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
    const meta = { ...((receipt.meta ?? {}) as Record<string, unknown>) };

    const currentPayment = Number(
      meta.currentPayment ?? receipt.amount ?? 0,
    );
    const previousPaid = Number(meta.previousPaid ?? 0);
    const invoiceTotal = Number(
      meta.invoiceTotal ?? currentPayment + previousPaid,
    );
    const balance = Number(meta.balance ?? 0);

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
      meta: {
        ...meta,
        invoiceNumber: meta.invoiceNumber,
        invoiceTotal,
        previousPaid,
        currentPayment,
        balance,
      },
      paymentContext: {
        invoiceNumber: meta.invoiceNumber
          ? String(meta.invoiceNumber)
          : undefined,
        invoiceTotal,
        previousPaid,
        currentPayment,
        balance,
        totalPaid: previousPaid + currentPayment,
      },
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
    const payload = (tx.payload ?? {}) as {
      stage?: string;
      timeline?: unknown[];
      daraja?: Record<string, unknown>;
      patientName?: string;
      mrn?: string;
      phoneMasked?: string;
      simulated?: boolean;
      mode?: string;
    };
    const stage = payload.stage || tx.status;
    return {
      ok: true,
      checkoutId: tx.id,
      paymentId: tx.id,
      correlationId: tx.id,
      status: tx.status,
      stage,
      phone: tx.phone,
      phoneMasked: payload.phoneMasked || maskMpesaPhone(tx.phone),
      amount: Number(tx.amount),
      checkoutRequestId: tx.checkout_request_id.startsWith('QUEUED-')
        ? undefined
        : tx.checkout_request_id,
      merchantRequestId: tx.merchant_request_id ?? undefined,
      mpesaReceipt: tx.mpesa_receipt_number,
      resultCode: tx.result_code,
      message: statusUserMessage(tx.status, stage, tx.result_desc),
      failureReason: ['FAILED', 'CANCELLED', 'TIMEOUT'].includes(tx.status)
        ? mapMpesaFailureReason({
            resultCode: tx.result_code,
            resultDesc: tx.result_desc,
          })
        : undefined,
      source: tx.source,
      receiptId: receiptId ?? undefined,
      paid: tx.status === 'SUCCESS',
      timeline: payload.timeline ?? [],
      daraja: payload.daraja,
      mode: payload.simulated
        ? 'sandbox-sim'
        : payload.mode || (this.client.configured ? 'live' : 'sandbox-sim'),
      createdAt: tx.created_at.toISOString(),
    };
  }

  private async assertQueueReady(): Promise<void> {
    try {
      await Promise.race([
        this.paymentsQueue.isReady(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis/payment queue not ready (timeout)')),
            4_000,
          ),
        ),
      ]);
      const client = (this.paymentsQueue as Queue & { client?: { status?: string } })
        .client;
      if (client?.status === 'end' || client?.status === 'close') {
        throw new Error('Redis connection closed');
      }
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? err.message
          : 'Payment queue unavailable (Redis)',
      );
    }
  }

  private async failPayment(
    checkoutId: string,
    opts: {
      resultCode: string;
      resultDesc: string;
      stage: MpesaStage;
      status?: 'FAILED' | 'CANCELLED' | 'TIMEOUT';
      notify?: boolean;
      extraPayload?: Record<string, unknown>;
    },
  ): Promise<MpesaTransactionRow> {
    const tx = await this.billingRepo.findMpesaById(checkoutId);
    if (!tx) throw new NotFoundException('Checkout not found');
    if (isTerminalMpesaStatus(tx.status)) return tx;

    const status = opts.status ?? 'FAILED';
    const payload = appendTimeline(
      {
        ...((tx.payload as Record<string, unknown>) || {}),
        ...(opts.extraPayload || {}),
      },
      opts.stage,
      opts.resultDesc,
    );
    const updated = await this.billingRepo.updateMpesaTransaction(checkoutId, {
      status,
      resultCode: opts.resultCode,
      resultDesc: opts.resultDesc,
      payload,
    });
    this.logger.warn(
      JSON.stringify({
        event: 'JOB_FAILED',
        paymentId: updated.id,
        status,
        stage: opts.stage,
        resultCode: opts.resultCode,
        phoneMasked: maskMpesaPhone(updated.phone),
        correlationId: updated.id,
      }),
    );
    if (opts.notify !== false && status === 'FAILED') {
      await this.notifyPaymentFailure(updated);
    }
    return updated;
  }

  private async notifyPaymentFailure(tx: MpesaTransactionRow): Promise<void> {
    const payload = (tx.payload ?? {}) as {
      patientName?: string;
      mrn?: string;
      phoneMasked?: string;
      invoiceId?: string;
    };
    let alertUserIds: string[] = [tx.initiated_by];
    try {
      const admins = await this.billingRepo.findBillingAlertUserIds();
      alertUserIds = [...new Set([...alertUserIds, ...admins])];
    } catch {
      // still notify initiator
    }
    this.emitPaymentDomain('payment.failed', {
      patientId: tx.patient_id ?? undefined,
      visitId: tx.visit_id ?? undefined,
      checkoutId: tx.id,
      paymentId: tx.id,
      amount: Number(tx.amount),
      phoneMasked: payload.phoneMasked || maskMpesaPhone(tx.phone),
      reason: mapMpesaFailureReason({
        resultCode: tx.result_code,
        resultDesc: tx.result_desc,
      }),
      patientName: payload.patientName,
      mrn: payload.mrn,
      initiatedBy: tx.initiated_by,
      notifyUserIds: alertUserIds,
      status: tx.status,
    });
  }

  private async finalizeSuccess(
    txId: string,
    info: { mpesaReceipt?: string; resultDesc?: string },
  ) {
    // Atomic PENDING → FINALIZING claim (poll + callback race).
    const claimed = await this.billingRepo.claimMpesaPending(txId, {
      status: 'FINALIZING',
      resultDesc: info.resultDesc || 'Finalizing',
      mpesaReceiptNumber: info.mpesaReceipt,
    });
    if (!claimed) {
      const existing = await this.billingRepo.findMpesaById(txId);
      if (!existing) throw new NotFoundException('Checkout not found');
      if (existing.status === 'SUCCESS' || existing.status === 'FINALIZING') {
        const receipt = await this.billingRepo.findReceiptByMpesaTxId(
          existing.id,
        );
        return this.toStatusPayload(existing, receipt?.id);
      }
      throw new BadRequestException(
        `Checkout cannot be finalized from status ${existing.status}`,
      );
    }
    const tx = await this.billingRepo.updateMpesaTransaction(claimed.id, {
      payload: appendTimeline(
        (claimed.payload as Record<string, unknown>) || {},
        'FINALIZING',
        info.resultDesc || 'Finalizing payment',
      ),
    });
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
        payload: appendTimeline(
          (tx.payload as Record<string, unknown>) || {},
          'SUCCESS',
          'Payment confirmed',
        ),
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
      this.emitPaymentDomain('payment.received', {
        patientId: patient.id,
        visitId: visit.id,
        checkoutId: tx.id,
        paymentId: tx.id,
        amount: total,
      });
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
      payload: appendTimeline(
        (tx.payload as Record<string, unknown>) || {},
        'SUCCESS',
        'Payment confirmed',
      ),
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
    this.emitPaymentDomain('payment.received', {
      patientId: patient.id,
      visitId: visit.id,
      checkoutId: tx.id,
      paymentId: tx.id,
      amount: total,
    });
    return this.toStatusPayload(updatedTx, receipt.id);
  }

  private emitPaymentDomain(
    type: 'payment.received' | 'payment.failed',
    payload: {
      patientId?: string;
      visitId?: string;
      checkoutId?: string;
      paymentId?: string;
      amount?: number;
      phoneMasked?: string;
      reason?: string;
      patientName?: string;
      mrn?: string;
      initiatedBy?: string;
      notifyUserIds?: string[];
      status?: string;
    },
  ): void {
    this.events.emit(type, {
      id: createDomainEventId(),
      type,
      occurredAt: new Date().toISOString(),
      payload,
    });
  }
}
