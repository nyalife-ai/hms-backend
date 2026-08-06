/**
 * File: vital-signs.processor.ts
 * Module: vital-signs
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { VITAL_SIGNS_QUEUE } from '../constants/vital-signs.constants';

@Processor(VITAL_SIGNS_QUEUE.NAME)
export class VitalSignsProcessor {
  private readonly logger = new Logger(VitalSignsProcessor.name);

  @Process(VITAL_SIGNS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
