/**
 * File: audit.queue.ts
 * Module: audit
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { AUDIT_QUEUE } from '../constants/audit.constants';

@Injectable()
export class AuditQueueService {
  public constructor(@InjectQueue(AUDIT_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(AUDIT_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
