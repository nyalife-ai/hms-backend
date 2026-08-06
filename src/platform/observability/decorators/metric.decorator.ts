import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { MetricLabels } from '../metrics/metric.types';

export const METRIC_METADATA = 'platform:observability:metric';

export type MetricKind = 'counter' | 'gauge' | 'histogram';

export interface MetricOptions {
  readonly name: string;
  readonly kind?: MetricKind;
  readonly labels?: MetricLabels;
}

export interface ResolvedMetricOptions extends MetricOptions {
  readonly kind: MetricKind;
}

/**
 * Marks a method to be counted/measured by {@link MetricsInterceptor}.
 * `kind` defaults to `'counter'`; use `'histogram'` to record call duration
 * in seconds.
 */
export function Metric(options: MetricOptions): CustomDecorator {
  if (options.name.trim().length === 0) {
    throw new Error('Metric name must not be empty');
  }
  const resolved: ResolvedMetricOptions = {
    ...options,
    kind: options.kind ?? 'counter',
  };
  return SetMetadata(METRIC_METADATA, resolved);
}
