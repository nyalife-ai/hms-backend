/**
 * File: beds.processor.ts
 * Module: beds
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { BEDS_QUEUE } from '../constants/beds.constants';

@Processor(BEDS_QUEUE.NAME)
export class BedsProcessor {
  private readonly logger = new Logger(BedsProcessor.name);

  @Process(BEDS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
