import { ObservabilityLoggerKind } from '../../configuration/observability.config';
import { LogContext } from '../../logging/log-context';
import { StructuredLogger } from '../../logging/logger.interface';
import {
  JsonStructuredLogger,
  LogLevel,
} from '../../logging/structured-logger';
import { ModuleResolver } from '../load-optional';
import { PinoStructuredLogger } from './pino.logger';
import { WinstonStructuredLogger } from './winston.logger';

export interface CreateLoggerOptions {
  readonly minimumLevel?: LogLevel;
  readonly context?: LogContext;
  readonly resolver?: ModuleResolver;
}

/** Factory selecting a {@link StructuredLogger} implementation by kind. */
export function createLogger(
  kind: ObservabilityLoggerKind,
  options: CreateLoggerOptions = {},
): StructuredLogger {
  switch (kind) {
    case 'json':
      return new JsonStructuredLogger(
        undefined,
        options.context,
        options.minimumLevel,
      );
    case 'pino':
      return new PinoStructuredLogger({
        level: options.minimumLevel,
        context: options.context,
        resolver: options.resolver,
      });
    case 'winston':
      return new WinstonStructuredLogger({
        level: options.minimumLevel,
        context: options.context,
        resolver: options.resolver,
      });
    default:
      throw new RangeError(
        `Unknown observability logger kind: ${String(kind)}`,
      );
  }
}
