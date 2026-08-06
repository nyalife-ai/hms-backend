import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { finalize, Observable, tap } from 'rxjs';
import {
  METRIC_METADATA,
  ResolvedMetricOptions,
} from '../decorators/metric.decorator';
import { MetricsCollectorLike } from '../metrics/metric.types';

/**
 * Records counter/gauge/histogram observations for handlers marked with
 * `@Metric()`. Histograms record call duration in seconds; counters/gauges
 * increment by one per call. A `status` label (`success`/`error`) is always
 * added.
 *
 * Deliberately undecorated (no `@Injectable()`/`@Inject()`): register it via
 * a `useFactory` provider bound to `OBSERVABILITY_METRICS` (see
 * `ObservabilityModule`).
 */
export class MetricsInterceptor implements NestInterceptor {
  public constructor(
    private readonly metrics: MetricsCollectorLike,
    private readonly reflector: Reflector,
  ) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<ResolvedMetricOptions>(
      METRIC_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!options) {
      return next.handle();
    }
    const startedAt = Date.now();
    let failed = false;
    return next.handle().pipe(
      tap({
        error: (): void => {
          failed = true;
        },
      }),
      finalize((): void => {
        this.record(options, startedAt, failed ? 'error' : 'success');
      }),
    );
  }

  private record(
    options: ResolvedMetricOptions,
    startedAt: number,
    status: 'success' | 'error',
  ): void {
    const labels = { ...(options.labels ?? {}), status };
    switch (options.kind) {
      case 'gauge':
        this.metrics.gauge(options.name).inc(1, labels);
        break;
      case 'histogram':
        this.metrics
          .histogram(options.name)
          .observe((Date.now() - startedAt) / 1_000, labels);
        break;
      case 'counter':
        this.metrics.counter(options.name).inc(1, labels);
        break;
    }
  }
}
