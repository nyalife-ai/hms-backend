/**
 * File: pharmacy.processor.ts
 * Module: pharmacy
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PHARMACY_QUEUE } from '../constants/pharmacy.constants';

@Processor(PHARMACY_QUEUE.NAME)
export class PharmacyProcessor {
  private readonly logger = new Logger(PharmacyProcessor.name);

  @Process(PHARMACY_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
