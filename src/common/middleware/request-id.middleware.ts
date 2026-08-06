import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Ensures every inbound request carries an `x-request-id` header.
 *
 * If the client (or an upstream gateway) already provided one, it is preserved;
 * otherwise a UUID v4 is generated. The same value is echoed on the response
 * so clients and load balancers can correlate logs across hops.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const existing = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof existing === 'string' && existing.length > 0
        ? existing
        : randomUUID();

    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  }
}
