import { applyDecorators } from '@nestjs/common';
import { SpanAttribute } from '../tracing/tracer.interface';
import { Metric, MetricKind } from './metric.decorator';
import { Timed } from './timed.decorator';
import { Trace } from './trace.decorator';

const DEFAULT_METRIC_NAME = 'observed_operations_total';

export interface ObservedOptions {
  readonly name?: string;
  readonly attributes?: Readonly<Record<string, SpanAttribute>>;
  /** Defaults to `true`. */
  readonly trace?: boolean;
  /** Defaults to `true`. */
  readonly timed?: boolean;
  /** Defaults to `false`; pass `true` for a default counter, or an object to customize. */
  readonly metric?:
    boolean | { readonly name?: string; readonly kind?: MetricKind };
}

/**
 * Convenience composition of {@link Trace}, {@link Timed}, and (optionally)
 * {@link Metric} in a single decorator.
 */
export function Observed(
  options: ObservedOptions = {},
): MethodDecorator & ClassDecorator {
  const decorators: Array<MethodDecorator & ClassDecorator> = [];
  if (options.trace !== false) {
    decorators.push(
      Trace({ name: options.name, attributes: options.attributes }),
    );
  }
  if (options.timed !== false) {
    decorators.push(Timed({ name: options.name }));
  }
  if (options.metric) {
    const metricOptions =
      typeof options.metric === 'object' ? options.metric : {};
    decorators.push(
      Metric({
        name: metricOptions.name ?? options.name ?? DEFAULT_METRIC_NAME,
        kind: metricOptions.kind,
      }),
    );
  }
  return applyDecorators(...decorators);
}
