/**
 * File: appointments.queue.ts
 * Module: appointments
 * Purpose: Queue helper stub.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { APPOINTMENTS_QUEUE } from '../constants/appointments.constants';

@Injectable()
export class AppointmentsQueueService {
  public constructor(@InjectQueue(APPOINTMENTS_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(APPOINTMENTS_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
