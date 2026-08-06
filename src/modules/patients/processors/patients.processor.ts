/**
 * File: patients.processor.ts
 * Module: patients
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PATIENTS_QUEUE } from '../constants/patients.constants';

@Processor(PATIENTS_QUEUE.NAME)
export class PatientsProcessor {
  private readonly logger = new Logger(PatientsProcessor.name);

  @Process(PATIENTS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
