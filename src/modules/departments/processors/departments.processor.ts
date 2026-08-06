/**
 * File: departments.processor.ts
 * Module: departments
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DEPARTMENTS_QUEUE } from '../constants/departments.constants';

@Processor(DEPARTMENTS_QUEUE.NAME)
export class DepartmentsProcessor {
  private readonly logger = new Logger(DepartmentsProcessor.name);

  @Process(DEPARTMENTS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
