/**
 * File: diagnoses.queue.ts
 * Module: diagnoses
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { DIAGNOSES_QUEUE } from '../constants/diagnoses.constants';

@Injectable()
export class DiagnosesQueueService {
  public constructor(@InjectQueue(DIAGNOSES_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(DIAGNOSES_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
