/**
 * File: pharmacy.queue.ts
 * Module: pharmacy
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { PHARMACY_QUEUE } from '../constants/pharmacy.constants';

@Injectable()
export class PharmacyQueueService {
  public constructor(@InjectQueue(PHARMACY_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(PHARMACY_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
