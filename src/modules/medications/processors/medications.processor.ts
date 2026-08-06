/**
 * File: medications.processor.ts
 * Module: medications
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { MEDICATIONS_QUEUE } from '../constants/medications.constants';

@Processor(MEDICATIONS_QUEUE.NAME)
export class MedicationsProcessor {
  private readonly logger = new Logger(MedicationsProcessor.name);

  @Process(MEDICATIONS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
