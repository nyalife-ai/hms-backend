import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { OBSERVABILITY_TRACER } from '../../../platform/observability/observability.module';
import type { Tracer } from '../../../platform/observability/tracing/tracer.interface';

/**
 * Stage 7 — response/tracing.
 * Opens a span around the handler when a Tracer is bound.
 */
@Injectable()
export class TracingInterceptor implements NestInterceptor {
  public constructor(
    @Optional()
    @Inject(OBSERVABILITY_TRACER)
    private readonly tracer?: Tracer,
  ) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (!this.tracer) {
      return next.handle();
    }
    const handler = context.getHandler().name || 'handler';
    const className = context.getClass().name || 'Controller';
    const span = this.tracer.startSpan(`${className}.${handler}`);
    return next.handle().pipe(
      tap({
        error: (error: unknown): void => {
          if (error instanceof Error) {
            span.recordException(error);
          }
          span.end();
        },
        complete: (): void => {
          span.end();
        },
      }),
    );
  }
}
