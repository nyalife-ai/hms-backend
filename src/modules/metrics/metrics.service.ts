import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';
import type { HttpMetricsPort } from '../../common/metrics/http-metrics.port';

/**
 * Framework-facing Prometheus metrics.
 *
 * Business-domain counters (payments, NFC, webhooks) were removed with the
 * unused business modules. Feature modules should register their own metrics
 * via platform observability or local collectors.
 */
@Injectable()
export class MetricsService implements OnModuleInit, HttpMetricsPort {
  public readonly registry: Registry;
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;
  public readonly httpRequestsInFlight: Gauge<string>;
  public readonly httpErrorsTotal: Counter<string>;

  public constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry, prefix: 'nodejs_' });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP latency in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.httpRequestsInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Requests currently being processed',
      labelNames: ['method'],
      registers: [this.registry],
    });
    this.httpErrorsTotal = new Counter({
      name: 'http_errors_total',
      help: 'Total 4xx and 5xx responses',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });
  }

  public onModuleInit(): void {
    // Metrics are registered eagerly in the constructor.
  }

  public getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
