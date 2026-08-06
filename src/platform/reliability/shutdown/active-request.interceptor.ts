import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ActiveRequestTracker } from './active-request.tracker';

export class ActiveRequestInterceptor implements NestInterceptor {
  public constructor(private readonly tracker: ActiveRequestTracker) {}

  public intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    this.tracker.increment();
    try {
      return next.handle().pipe(finalize(() => this.tracker.decrement()));
    } catch (error: unknown) {
      this.tracker.decrement();
      throw error;
    }
  }
}
