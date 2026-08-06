import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId,
} from '../logging/correlation';

export interface RequestWithCorrelationId extends Request {
  correlationId?: string;
}

/**
 * Express middleware counterpart of {@link CorrelationInterceptor}. Prefer
 * the interceptor inside Nest HTTP handlers; use this middleware when
 * correlation ids are needed earlier in the pipeline (e.g. before guards).
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  public use(
    request: RequestWithCorrelationId,
    response: Response,
    next: NextFunction,
  ): void {
    const correlationId = resolveCorrelationId(
      request.headers[CORRELATION_ID_HEADER],
    );
    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
