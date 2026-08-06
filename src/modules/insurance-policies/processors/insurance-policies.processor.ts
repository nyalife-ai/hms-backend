/**
 * File: insurance-policies.processor.ts
 * Module: insurance-policies
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { INSURANCE_POLICIES_QUEUE } from '../constants/insurance-policies.constants';

@Processor(INSURANCE_POLICIES_QUEUE.NAME)
export class InsurancePoliciesProcessor {
  private readonly logger = new Logger(InsurancePoliciesProcessor.name);

  @Process(INSURANCE_POLICIES_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
