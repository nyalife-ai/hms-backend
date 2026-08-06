/**
 * File: laboratory.processor.ts
 * Module: laboratory
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { LABORATORY_QUEUE } from '../constants/laboratory.constants';

@Processor(LABORATORY_QUEUE.NAME)
export class LaboratoryProcessor {
  private readonly logger = new Logger(LaboratoryProcessor.name);

  @Process(LABORATORY_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
