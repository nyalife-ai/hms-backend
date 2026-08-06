/**
 * File: inpatient.processor.ts
 * Module: inpatient
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { INPATIENT_QUEUE } from '../constants/inpatient.constants';

@Processor(INPATIENT_QUEUE.NAME)
export class InpatientProcessor {
  private readonly logger = new Logger(InpatientProcessor.name);

  @Process(INPATIENT_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
