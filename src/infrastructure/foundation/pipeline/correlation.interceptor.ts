import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId,
} from '../../../platform/observability/logging/correlation';

interface CorrelationRequest extends Request {
  correlationId?: string;
}

/**
 * Stage 1 — request/correlation context.
 * Propagates `x-correlation-id` on the request and response.
 */
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<CorrelationRequest>();
    const response = http.getResponse<Response>();
    const correlationId = resolveCorrelationId(
      request.headers[CORRELATION_ID_HEADER],
    );
    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    return next.handle();
  }
}
