/**
 * File: insurance-policies.queue.ts
 * Module: insurance-policies
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { INSURANCE_POLICIES_QUEUE } from '../constants/insurance-policies.constants';

@Injectable()
export class InsurancePoliciesQueueService {
  public constructor(@InjectQueue(INSURANCE_POLICIES_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(INSURANCE_POLICIES_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
