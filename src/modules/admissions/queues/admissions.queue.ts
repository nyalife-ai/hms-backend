/**
 * File: admissions.queue.ts
 * Module: admissions
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { ADMISSIONS_QUEUE } from '../constants/admissions.constants';

@Injectable()
export class AdmissionsQueueService {
  public constructor(@InjectQueue(ADMISSIONS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(ADMISSIONS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
