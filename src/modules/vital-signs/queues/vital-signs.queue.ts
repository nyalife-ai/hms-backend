/**
 * File: vital-signs.queue.ts
 * Module: vital-signs
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { VITAL_SIGNS_QUEUE } from '../constants/vital-signs.constants';

@Injectable()
export class VitalSignsQueueService {
  public constructor(@InjectQueue(VITAL_SIGNS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(VITAL_SIGNS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
