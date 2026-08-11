/**
 * Express middleware — opens AsyncLocalStorage scope for the request.
 */

import type { NextFunction, Request, Response } from 'express';
import { runWithAuditContext } from './audit-request.context';

export function auditContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  runWithAuditContext(
    {
      skipDepth: 0,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
    },
    () => next(),
  );
}
