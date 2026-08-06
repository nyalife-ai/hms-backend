/**
 * File: patients.queue.ts
 * Module: patients
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { PATIENTS_QUEUE } from '../constants/patients.constants';

@Injectable()
export class PatientsQueueService {
  public constructor(@InjectQueue(PATIENTS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(PATIENTS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
