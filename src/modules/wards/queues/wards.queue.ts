/**
 * File: wards.queue.ts
 * Module: wards
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { WARDS_QUEUE } from '../constants/wards.constants';

@Injectable()
export class WardsQueueService {
  public constructor(@InjectQueue(WARDS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(WARDS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
