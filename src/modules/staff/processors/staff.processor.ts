/**
 * File: staff.processor.ts
 * Module: staff
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { STAFF_QUEUE } from '../constants/staff.constants';

@Processor(STAFF_QUEUE.NAME)
export class StaffProcessor {
  private readonly logger = new Logger(StaffProcessor.name);

  @Process(STAFF_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
