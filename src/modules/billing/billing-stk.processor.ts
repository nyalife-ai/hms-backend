/**
 * Async M-Pesa STK push worker (Bull / Redis).
 *
 * Job: payment.stk_push on queue nyalife-payments (BULL_PAYMENTS_QUEUE).
 * Correlation: job.data.checkoutId === mpesa_transactions.id
 */

import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import {
  BILLING_PAYMENTS_QUEUE,
  BILLING_STK_JOB,
  type BillingStkJobData,
} from './billing-queue.constants';
import { CheckoutService } from './checkout.service';
import { isRetryableStkError, maskMpesaPhone } from './mpesa-lifecycle';

export {
  BILLING_PAYMENTS_QUEUE,
  BILLING_STK_JOB,
  type BillingStkJobData,
} from './billing-queue.constants';

@Processor(BILLING_PAYMENTS_QUEUE)
export class BillingStkProcessor {
  private readonly logger = new Logger(BillingStkProcessor.name);

  public constructor(private readonly checkout: CheckoutService) {}

  @OnQueueActive()
  onActive(job: Job<BillingStkJobData>): void {
    if (job.name !== BILLING_STK_JOB) return;
    this.logger.log(
      JSON.stringify({
        event: 'JOB_PICKED_UP',
        paymentId: job.data?.checkoutId,
        jobId: job.id,
        visitId: job.data?.visitId,
        phoneMasked: job.data?.phone
          ? maskMpesaPhone(job.data.phone)
          : undefined,
        attempt: job.attemptsMade + 1,
        correlationId: job.data?.checkoutId,
      }),
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job<BillingStkJobData>): void {
    if (job.name !== BILLING_STK_JOB) return;
    this.logger.log(
      JSON.stringify({
        event: 'JOB_COMPLETED',
        paymentId: job.data?.checkoutId,
        jobId: job.id,
        correlationId: job.data?.checkoutId,
      }),
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<BillingStkJobData>, error: Error): Promise<void> {
    // Shared Redis used to deliver foreign job names (e.g. session.create) here.
    if (job?.name && job.name !== BILLING_STK_JOB) {
      this.logger.warn(
        `Ignoring non-STK job name=${job.name} id=${job.id}: ${error.message}`,
      );
      return;
    }

    const maxAttempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= maxAttempts;
    const retryable = isRetryableStkError(error);

    this.logger.warn(
      JSON.stringify({
        event: exhausted || !retryable ? 'JOB_FAILED' : 'JOB_RETRYING',
        paymentId: job.data?.checkoutId,
        jobId: job.id,
        attempt: job.attemptsMade,
        maxAttempts,
        retryable,
        message: error.message,
        correlationId: job.data?.checkoutId,
      }),
    );

    if ((exhausted || !retryable) && job.data?.checkoutId) {
      try {
        await this.checkout.markStkJobFailed(job.data.checkoutId, error);
      } catch (markErr) {
        this.logger.error(
          `Failed to mark STK payment failed paymentId=${job.data.checkoutId}: ${
            markErr instanceof Error ? markErr.message : String(markErr)
          }`,
        );
      }
    }
  }

  @Process(BILLING_STK_JOB)
  public async handle(job: Job<BillingStkJobData>) {
    const data = job.data;
    if (!data?.checkoutId) {
      throw new Error('STK job missing checkoutId correlation');
    }
    this.logger.log(
      JSON.stringify({
        event: 'JOB_PROCESSING',
        paymentId: data.checkoutId,
        visitId: data.visitId,
        phoneMasked: maskMpesaPhone(data.phone),
        correlationId: data.checkoutId,
      }),
    );
    try {
      return await this.checkout.executeQueuedStk({
        checkoutId: data.checkoutId,
        visitId: data.visitId,
        phone: data.phone,
        source: data.source,
        actorUserId: data.actorUserId,
      });
    } catch (err) {
      if (!isRetryableStkError(err)) {
        // Permanent failure already persisted by executeQueuedStk / mark path.
        // Prevent Bull from retrying endlessly.
        await job.discard();
      }
      throw err;
    }
  }
}
