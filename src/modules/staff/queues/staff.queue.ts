/**
 * File: staff.queue.ts
 * Module: staff
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { STAFF_QUEUE } from '../constants/staff.constants';

@Injectable()
export class StaffQueueService {
  public constructor(@InjectQueue(STAFF_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(STAFF_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
