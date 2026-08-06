/**
 * File: procedures.processor.ts
 * Module: procedures
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PROCEDURES_QUEUE } from '../constants/procedures.constants';

@Processor(PROCEDURES_QUEUE.NAME)
export class ProceduresProcessor {
  private readonly logger = new Logger(ProceduresProcessor.name);

  @Process(PROCEDURES_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
