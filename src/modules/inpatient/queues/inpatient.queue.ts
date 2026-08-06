/**
 * File: inpatient.queue.ts
 * Module: inpatient
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { INPATIENT_QUEUE } from '../constants/inpatient.constants';

@Injectable()
export class InpatientQueueService {
  public constructor(@InjectQueue(INPATIENT_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(INPATIENT_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
