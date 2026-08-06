/**
 * File: consultations.queue.ts
 * Module: consultations
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { CONSULTATIONS_QUEUE } from '../constants/consultations.constants';

@Injectable()
export class ConsultationsQueueService {
  public constructor(@InjectQueue(CONSULTATIONS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(CONSULTATIONS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
