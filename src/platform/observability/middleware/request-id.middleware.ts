import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { generateId } from '../../../core';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithRequestId extends Request {
  requestId?: string;
}

/**
 * Assigns a stable per-request id, reusing an incoming `X-Request-Id`
 * header when present (e.g. set by an upstream gateway/load balancer) so
 * request ids remain consistent end-to-end.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  public constructor(
    private readonly generateRequestId: () => string = (): string =>
      generateId('request'),
  ) {}

  public use(
    request: RequestWithRequestId,
    response: Response,
    next: NextFunction,
  ): void {
    const incoming = request.headers[REQUEST_ID_HEADER];
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId =
      candidate !== undefined && candidate.trim().length > 0
        ? candidate.trim()
        : this.generateRequestId();
    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
