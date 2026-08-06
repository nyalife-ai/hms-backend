import { Injectable } from '@nestjs/common';
import { generateId } from '../../../core';
import { Job, JobOptions } from '../contracts/job.interface';

export type JobFactoryClock = () => Date;
export type JobIdFactory = () => string;

@Injectable()
export class JobFactory {
  public constructor(
    private readonly clock: JobFactoryClock = () => new Date(),
    private readonly idFactory: JobIdFactory = () => generateId('job'),
  ) {}

  public create<TPayload>(
    payload: TPayload,
    options: JobOptions = {},
  ): Job<TPayload> {
    const priority = options.priority ?? 0;
    const maxAttempts = options.maxAttempts ?? 1;
    if (!Number.isFinite(priority)) {
      throw new RangeError('Job priority must be finite');
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('Job maxAttempts must be a positive integer');
    }
    return {
      id: this.idFactory(),
      payload,
      createdAt: this.clock(),
      priority,
      attempts: 0,
      maxAttempts,
      metadata: Object.freeze({ ...(options.metadata ?? {}) }),
    };
  }
}
