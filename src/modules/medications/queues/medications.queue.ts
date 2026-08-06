/**
 * File: medications.queue.ts
 * Module: medications
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { MEDICATIONS_QUEUE } from '../constants/medications.constants';

@Injectable()
export class MedicationsQueueService {
  public constructor(@InjectQueue(MEDICATIONS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(MEDICATIONS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
