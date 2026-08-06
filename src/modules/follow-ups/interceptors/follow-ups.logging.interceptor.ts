/**
 * File: follow-ups.logging.interceptor.ts
 * Module: follow-ups
 * Purpose: Request logging interceptor stub.
 */

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class FollowUpsLoggingInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const req = context.switchToHttp().getRequest<{ method?: string; url?: string }>();
    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - started;
        console.debug(`[FollowUps] ${req.method ?? '?'} ${req.url ?? ''} ${ms}ms`);
      }),
    );
  }
}
