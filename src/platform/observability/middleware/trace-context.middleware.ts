import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  encodeSpanContext,
  extractTraceContext,
  TRACE_CONTEXT_HEADER,
} from '../providers/opentelemetry/context.propagation';
import { Span, SpanContext, Tracer } from '../tracing/tracer.interface';

export interface RequestWithSpan extends Request {
  span?: Span;
  traceContext?: SpanContext;
}

/**
 * Starts a root {@link Span} for every request (propagating an incoming
 * `traceparent`-style header as the parent when present), attaches it to the
 * request, echoes the resulting context on the response, and ends the span
 * when the response finishes.
 *
 * Deliberately undecorated (no `@Injectable()`/`@Inject()`): register it via
 * a `useFactory` provider bound to `OBSERVABILITY_TRACER` (see
 * `ObservabilityModule`).
 */
export class TraceContextMiddleware implements NestMiddleware {
  public constructor(private readonly tracer: Tracer) {}

  public use(
    request: RequestWithSpan,
    response: Response,
    next: NextFunction,
  ): void {
    const parent = extractTraceContext(request.headers);
    const span = this.tracer.startSpan(
      `${request.method ?? 'GET'} ${request.path ?? request.url ?? '/'}`,
      {
        parent,
        attributes: { 'http.method': request.method ?? 'GET' },
      },
    );
    request.span = span;
    request.traceContext = span.context;
    response.setHeader(TRACE_CONTEXT_HEADER, encodeSpanContext(span.context));
    response.on('finish', (): void => {
      span.setAttribute('http.status_code', response.statusCode);
      span.end();
    });
    next();
  }
}
