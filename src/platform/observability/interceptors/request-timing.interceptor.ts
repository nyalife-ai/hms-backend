import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { finalize, Observable, tap } from 'rxjs';
import { Monitor } from '../monitoring/monitor.interface';

interface ResponseLike {
  readonly statusCode?: number;
}

/**
 * Feeds every HTTP request's latency/status into {@link Monitor}. No-op for
 * non-HTTP execution contexts (RPC, WebSocket, GraphQL resolvers wrapped
 * outside an HTTP transport).
 *
 * Deliberately undecorated (no `@Injectable()`/`@Inject()`): register it via
 * a `useFactory` provider bound to `OBSERVABILITY_MONITOR` (see
 * `ObservabilityModule`).
 */
export class RequestTimingInterceptor implements NestInterceptor {
  public constructor(private readonly monitor: Monitor) {}

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const startedAt = Date.now();
    const response = context.switchToHttp().getResponse<ResponseLike>();
    let failed = false;
    return next.handle().pipe(
      tap({
        error: (): void => {
          failed = true;
        },
      }),
      finalize((): void => {
        const statusCode = this.resolveStatusCode(response, failed);
        this.monitor.recordRequest(Date.now() - startedAt, statusCode);
      }),
    );
  }

  private resolveStatusCode(response: ResponseLike, failed: boolean): number {
    const statusCode = response.statusCode;
    if (
      typeof statusCode === 'number' &&
      Number.isInteger(statusCode) &&
      statusCode >= 100 &&
      statusCode <= 599
    ) {
      return statusCode;
    }
    return failed ? 500 : 200;
  }
}
