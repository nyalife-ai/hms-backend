import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request, Response } from 'express';
import type { AppLoggerPort } from '../logging/app-logger.port';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

function formatMessage(message: string | string[]): string {
  return Array.isArray(message) ? message.join(', ') : message;
}

/**
 * Global HTTP Exception Filter.
 *
 * Catches all unhandled exceptions, logs them with severity based on status
 * code, and returns a standardised JSON error envelope. Extends
 * BaseExceptionFilter so NestJS default fallback behaviour is preserved for
 * truly unknown edge cases.
 */
@Injectable()
@Catch()
export class HttpExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(private readonly appLogger: AppLoggerPort) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null) {
        const body = payload as Record<string, unknown>;
        message =
          (body.message as string | string[]) || JSON.stringify(payload);
        errorCode = typeof body.error === 'string' ? body.error : undefined;
      } else {
        message = String(payload);
      }
    } else if (exception instanceof Error) {
      // Never leak raw Error.message for unexpected 500s in production —
      // the logger still receives the real message and stack below.
      message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception.message;
    }

    const stack = exception instanceof Error ? exception.stack : undefined;
    const requestIdHeader = request.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof requestIdHeader === 'string' ? requestIdHeader : 'unknown';

    const logData = {
      type: 'http_error',
      statusCode: status,
      route: request.url,
      method: request.method,
      requestId,
    };

    const clientErrorCodes: number[] = [
      HttpStatus.BAD_REQUEST,
      HttpStatus.UNAUTHORIZED,
      HttpStatus.FORBIDDEN,
      HttpStatus.NOT_FOUND,
      HttpStatus.CONFLICT,
      HttpStatus.UNPROCESSABLE_ENTITY,
      HttpStatus.TOO_MANY_REQUESTS,
    ];

    const messageText = formatMessage(message);
    const logMessage = `${request.method} ${request.url} → ${status}: ${
      exception instanceof Error ? exception.message : messageText
    }`;

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.appLogger.error(logMessage, stack, { context: 'HTTP', ...logData });
    } else if (clientErrorCodes.includes(status)) {
      this.appLogger.warn(
        `${request.method} ${request.url} → ${status}: ${messageText}`,
        { context: 'HTTP', ...logData },
      );
    } else {
      this.appLogger.warn(
        `${request.method} ${request.url} → ${status}: ${messageText}`,
        { context: 'HTTP', ...logData },
      );
    }

    if (!response.headersSent) {
      response.status(status).json({
        statusCode: status,
        message,
        ...(errorCode ? { error: errorCode } : {}),
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId,
      });
    }
  }
}
