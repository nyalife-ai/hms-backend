/**
 * File: prescriptions.queue.ts
 * Module: prescriptions
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { PRESCRIPTIONS_QUEUE } from '../constants/prescriptions.constants';

@Injectable()
export class PrescriptionsQueueService {
  public constructor(@InjectQueue(PRESCRIPTIONS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(PRESCRIPTIONS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
