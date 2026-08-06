import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  CORRELATION_ID_HEADER,
  HeaderValue,
  resolveCorrelationId,
} from '../logging/correlation';

interface RequestLike {
  readonly headers: Readonly<Record<string, HeaderValue>>;
  correlationId?: string;
}

interface ResponseLike {
  setHeader(name: string, value: string): unknown;
}

/**
 * Resolves (or generates) a correlation id for every HTTP request, attaches
 * it to the request object for downstream handlers/loggers, and echoes it
 * back on the response so clients can correlate retries.
 */
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestLike>();
    const response = httpContext.getResponse<ResponseLike>();
    const correlationId = resolveCorrelationId(
      request.headers[CORRELATION_ID_HEADER],
    );
    request.correlationId = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    return next.handle();
  }
}
