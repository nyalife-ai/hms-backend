/**
 * File: follow-ups.queue.ts
 * Module: follow-ups
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { FOLLOW_UPS_QUEUE } from '../constants/follow-ups.constants';

@Injectable()
export class FollowUpsQueueService {
  public constructor(@InjectQueue(FOLLOW_UPS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(FOLLOW_UPS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
