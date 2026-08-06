/**
 * File: prescriptions.processor.ts
 * Module: prescriptions
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PRESCRIPTIONS_QUEUE } from '../constants/prescriptions.constants';

@Processor(PRESCRIPTIONS_QUEUE.NAME)
export class PrescriptionsProcessor {
  private readonly logger = new Logger(PrescriptionsProcessor.name);

  @Process(PRESCRIPTIONS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
