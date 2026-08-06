/**
 * File: consultations.processor.ts
 * Module: consultations
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { CONSULTATIONS_QUEUE } from '../constants/consultations.constants';

@Processor(CONSULTATIONS_QUEUE.NAME)
export class ConsultationsProcessor {
  private readonly logger = new Logger(ConsultationsProcessor.name);

  @Process(CONSULTATIONS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
