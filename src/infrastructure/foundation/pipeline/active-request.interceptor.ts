import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { ActiveRequestTracker } from '../../../platform/reliability/shutdown/active-request.tracker';

interface RequestCounter {
  increment(): void;
  decrement(): void;
}

/**
 * Tracks in-flight HTTP requests so {@link GracefulShutdownService} can drain
 * before tearing down DB / Redis / broker connections.
 */
@Injectable()
export class ActiveRequestInterceptor implements NestInterceptor {
  public constructor(
    @Inject(ActiveRequestTracker) private readonly tracker: RequestCounter,
  ) {}

  public intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    this.tracker.increment();
    return next.handle().pipe(
      finalize((): void => {
        this.tracker.decrement();
      }),
    );
  }
}
