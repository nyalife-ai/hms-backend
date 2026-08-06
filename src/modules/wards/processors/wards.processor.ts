/**
 * File: wards.processor.ts
 * Module: wards
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { WARDS_QUEUE } from '../constants/wards.constants';

@Processor(WARDS_QUEUE.NAME)
export class WardsProcessor {
  private readonly logger = new Logger(WardsProcessor.name);

  @Process(WARDS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
