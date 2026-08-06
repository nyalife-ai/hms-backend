/**
 * File: documents.queue.ts
 * Module: documents
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { DOCUMENTS_QUEUE } from '../constants/documents.constants';

@Injectable()
export class DocumentsQueueService {
  public constructor(@InjectQueue(DOCUMENTS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(DOCUMENTS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
