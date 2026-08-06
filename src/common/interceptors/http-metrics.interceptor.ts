import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import type { HttpMetricsPort } from '../metrics/http-metrics.port';
import type { AppLoggerPort } from '../logging/app-logger.port';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

type RequestWithUser = Request & {
  user?: { id?: string | number };
};

/**
 * Global HTTP Metrics and Logging Interceptor.
 *
 * Records Prometheus counters/histograms for every request and writes one
 * structured log line per request. Register via
 * `app.useGlobalInterceptors(new HttpMetricsInterceptor(...))` in main.ts.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: HttpMetricsPort,
    private readonly logger: AppLoggerPort,
  ) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithUser>();
    const res = http.getResponse<Response>();

    const method = req.method;
    const routeCandidate: unknown = (req as unknown as { route?: unknown })
      .route;
    let routePath = req.url;
    if (
      typeof routeCandidate === 'object' &&
      routeCandidate !== null &&
      'path' in routeCandidate
    ) {
      const pathValue = Reflect.get(routeCandidate, 'path');
      if (typeof pathValue === 'string') {
        routePath = pathValue;
      }
    }
    const route = this.normaliseRoute(routePath);
    const startMs = Date.now();
    const userId = req.user?.id;
    const requestIdHeader = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof requestIdHeader === 'string' ? requestIdHeader : undefined;

    // Skip the scrape endpoint to prevent recursive metric generation.
    if (req.url === '/metrics' || req.path === '/metrics') {
      return next.handle();
    }

    this.metrics.httpRequestsInFlight.inc({ method });

    return next.handle().pipe(
      tap(() => {
        const statusCode = res.statusCode;
        const durationMs = Date.now() - startMs;
        const durationSec = durationMs / 1000;

        this.metrics.httpRequestsInFlight.dec({ method });
        this.metrics.httpRequestsTotal.inc({
          method,
          route,
          status_code: String(statusCode),
        });
        this.metrics.httpRequestDuration.observe(
          { method, route, status_code: String(statusCode) },
          durationSec,
        );

        if (statusCode >= 400) {
          this.metrics.httpErrorsTotal.inc({
            method,
            route,
            status_code: String(statusCode),
          });
        }

        this.logger.logRequest?.({
          method,
          url: req.url,
          statusCode,
          durationMs,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          userId,
          requestId,
        });
      }),

      catchError((err: Error & { status?: number }) => {
        const statusCode = err?.status || 500;
        const durationMs = Date.now() - startMs;
        const durationSec = durationMs / 1000;

        this.metrics.httpRequestsInFlight.dec({ method });
        this.metrics.httpRequestsTotal.inc({
          method,
          route,
          status_code: String(statusCode),
        });
        this.metrics.httpRequestDuration.observe(
          { method, route, status_code: String(statusCode) },
          durationSec,
        );
        this.metrics.httpErrorsTotal.inc({
          method,
          route,
          status_code: String(statusCode),
        });

        this.logger.error(
          `${method} ${req.url} → ${statusCode} (${durationMs}ms): ${err?.message}`,
          err?.stack,
          {
            type: 'http_error',
            statusCode,
            route,
            durationMs,
            userId,
            requestId,
          },
        );

        return throwError(() => err);
      }),
    );
  }

  /**
   * Normalise parameterised paths so Prometheus label cardinality stays low.
   *
   * Examples:
   *   /resources/12345              → /resources/:id
   *   /users/uuid/550e8400-e29b-... → /users/uuid/:uuid
   *   /api/test?foo=bar             → /api/test
   */
  private normaliseRoute(path: string): string {
    return path
      .replace(/\/[0-9]+/g, '/:id')
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '/:uuid',
      )
      .replace(/\?.*$/, '');
  }
}
