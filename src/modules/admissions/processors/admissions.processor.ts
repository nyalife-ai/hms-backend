/**
 * File: admissions.processor.ts
 * Module: admissions
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { ADMISSIONS_QUEUE } from '../constants/admissions.constants';

@Processor(ADMISSIONS_QUEUE.NAME)
export class AdmissionsProcessor {
  private readonly logger = new Logger(AdmissionsProcessor.name);

  @Process(ADMISSIONS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
