/**
 * File: audit.processor.ts
 * Module: audit
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { AUDIT_QUEUE } from '../constants/audit.constants';

@Processor(AUDIT_QUEUE.NAME)
export class AuditProcessor {
  private readonly logger = new Logger(AuditProcessor.name);

  @Process(AUDIT_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
