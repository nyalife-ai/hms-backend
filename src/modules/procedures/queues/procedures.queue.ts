/**
 * File: procedures.queue.ts
 * Module: procedures
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { PROCEDURES_QUEUE } from '../constants/procedures.constants';

@Injectable()
export class ProceduresQueueService {
  public constructor(@InjectQueue(PROCEDURES_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(PROCEDURES_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
