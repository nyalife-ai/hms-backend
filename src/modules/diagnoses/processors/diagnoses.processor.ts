/**
 * File: diagnoses.processor.ts
 * Module: diagnoses
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DIAGNOSES_QUEUE } from '../constants/diagnoses.constants';

@Processor(DIAGNOSES_QUEUE.NAME)
export class DiagnosesProcessor {
  private readonly logger = new Logger(DiagnosesProcessor.name);

  @Process(DIAGNOSES_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
