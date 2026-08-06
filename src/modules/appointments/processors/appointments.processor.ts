/**
 * File: appointments.processor.ts
 * Module: appointments
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { APPOINTMENTS_QUEUE } from '../constants/appointments.constants';

@Processor(APPOINTMENTS_QUEUE.NAME)
export class AppointmentsProcessor {
  private readonly logger = new Logger(AppointmentsProcessor.name);

  @Process(APPOINTMENTS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
