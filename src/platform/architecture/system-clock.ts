import { Injectable } from '@nestjs/common';
import type { Clock } from '../../core';

/** Production wall clock. */
@Injectable()
export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }

  public timestamp(): number {
    return Date.now();
  }
}
