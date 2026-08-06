/**
 * File: laboratory.queue.ts
 * Module: laboratory
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { LABORATORY_QUEUE } from '../constants/laboratory.constants';

@Injectable()
export class LaboratoryQueueService {
  public constructor(@InjectQueue(LABORATORY_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(LABORATORY_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
