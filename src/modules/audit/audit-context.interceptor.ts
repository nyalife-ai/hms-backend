/**
 * After JWT auth, attach userId to the audit ALS store.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { getAuditRequestStore } from './audit-request.context';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      user?: { id?: string };
      ip?: string;
      headers: Record<string, unknown>;
    }>();
    const store = getAuditRequestStore();
    if (store) {
      if (req.user?.id) store.userId = req.user.id;
      if (req.ip) store.ipAddress = req.ip;
      const ua = req.headers['user-agent'];
      if (typeof ua === 'string') store.userAgent = ua;
    }
    return next.handle();
  }
}
