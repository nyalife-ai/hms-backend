/**
 * File: beds.queue.ts
 * Module: beds
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { BEDS_QUEUE } from '../constants/beds.constants';

@Injectable()
export class BedsQueueService {
  public constructor(@InjectQueue(BEDS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(BEDS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
