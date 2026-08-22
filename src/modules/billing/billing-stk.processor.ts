/**
 * Async M-Pesa STK push worker (Bull / Redis).
 */

import {
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

export {
  BILLING_PAYMENTS_QUEUE,
  BILLING_STK_JOB,
  type BillingStkJobData,
} from './billing-queue.constants';

@Processor(BILLING_PAYMENTS_QUEUE)
export class BillingStkProcessor {
  private readonly logger = new Logger(BillingStkProcessor.name);

  public constructor(private readonly checkout: CheckoutService) {}

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.warn(
      `STK job failed id=${job.id} attempt=${job.attemptsMade}: ${error.message}`,
    );
  }

  @Process(BILLING_STK_JOB)
  public async handle(job: Job<BillingStkJobData>) {
    const data = job.data;
    this.logger.log(`STK execute visitId=${data.visitId}`);
    return this.checkout.executeQueuedStk({
      visitId: data.visitId,
      phone: data.phone,
      source: data.source,
      actorUserId: data.actorUserId,
    });
  }
}
