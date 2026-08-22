/**
 * File: notifications.queue.ts
 * Module: notifications
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { NOTIFICATIONS_QUEUE } from '../constants/notifications.constants';

@Injectable()
export class NotificationsQueueService {
  public constructor(@InjectQueue(NOTIFICATIONS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(NOTIFICATIONS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
