/**
 * File: radiology.processor.ts
 * Module: radiology
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { RADIOLOGY_QUEUE } from '../constants/radiology.constants';

@Processor(RADIOLOGY_QUEUE.NAME)
export class RadiologyProcessor {
  private readonly logger = new Logger(RadiologyProcessor.name);

  @Process(RADIOLOGY_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
