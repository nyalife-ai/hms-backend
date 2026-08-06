/**
 * File: radiology.queue.ts
 * Module: radiology
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { RADIOLOGY_QUEUE } from '../constants/radiology.constants';

@Injectable()
export class RadiologyQueueService {
  public constructor(@InjectQueue(RADIOLOGY_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(RADIOLOGY_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
