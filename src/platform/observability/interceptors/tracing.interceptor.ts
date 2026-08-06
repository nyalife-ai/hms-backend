import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { finalize, Observable, tap } from 'rxjs';
import { TRACE_METADATA, TraceOptions } from '../decorators/trace.decorator';
import { Span, Tracer } from '../tracing/tracer.interface';

/**
 * Wraps handlers marked with `@Trace()` in a {@link Span}, recording thrown
 * exceptions and always ending the span exactly once regardless of whether
 * the handler completes, errors, or is unsubscribed early.
 *
 * Deliberately undecorated (no `@Injectable()`/`@Inject()`): register it via
 * a `useFactory` provider bound to `OBSERVABILITY_TRACER` (see
 * `ObservabilityModule`), e.g.
 * `{ provide: APP_INTERCEPTOR, useFactory: (t, r) => new TracingInterceptor(t, r), inject: [OBSERVABILITY_TRACER, Reflector] }`.
 */
export class TracingInterceptor implements NestInterceptor {
  public constructor(
    private readonly tracer: Tracer,
    private readonly reflector: Reflector,
  ) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<TraceOptions>(
      TRACE_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!options) {
      return next.handle();
    }
    const name =
      options.name ?? `${context.getClass().name}.${context.getHandler().name}`;
    const span: Span = this.tracer.startSpan(name, {
      attributes: options.attributes,
    });
    return next.handle().pipe(
      tap({
        error: (error: unknown): void => {
          if (error instanceof Error) {
            span.recordException(error);
          }
        },
      }),
      finalize((): void => span.end()),
    );
  }
}
