/**
 * File: follow-ups.processor.ts
 * Module: follow-ups
 * Purpose: Bull queue processor stub.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { FOLLOW_UPS_QUEUE } from '../constants/follow-ups.constants';

@Processor(FOLLOW_UPS_QUEUE.NAME)
export class FollowUpsProcessor {
  private readonly logger = new Logger(FollowUpsProcessor.name);

  @Process(FOLLOW_UPS_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(`Processing job ${job.id}`);
  }
}
