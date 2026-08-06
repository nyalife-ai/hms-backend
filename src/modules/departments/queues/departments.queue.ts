/**
 * File: departments.queue.ts
 * Module: departments
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { DEPARTMENTS_QUEUE } from '../constants/departments.constants';

@Injectable()
export class DepartmentsQueueService {
  public constructor(@InjectQueue(DEPARTMENTS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(DEPARTMENTS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
