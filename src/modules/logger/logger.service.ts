import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

/**
 * Structured application logger backed by Winston.
 *
 * Prefer this over Nest's default logger for production JSON logs,
 * file rotation, and optional Elasticsearch shipping.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly logger: winston.Logger;
  private context = 'App';

  public constructor(private readonly configService: ConfigService) {
    const environment =
      configService.get<string>('app.environment') ??
      configService.get<string>('NODE_ENV') ??
      'development';
    const isDev = environment === 'development';
    const esUrl = configService.get<string>('ELASTICSEARCH_URL');
    const appName =
      configService.get<string>('app.name') ??
      configService.get<string>('APP_NAME') ??
      'api';

    const baseFields = winston.format((info) => {
      info.service = appName;
      info.environment = environment;
      return info;
    });

    const timestampFormat = winston.format.timestamp({
      format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
    });

    const consoleFormat = isDev
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ timestamp, level, context, message, ...meta }) => {
              const ctx = context ? `[${context}] ` : '';
              const extra = Object.keys(meta).length
                ? ` ${JSON.stringify(meta)}`
                : '';
              return `${timestamp} ${level} ${ctx}${message}${extra}`;
            },
          ),
        )
      : winston.format.json();

    const fileFormat = winston.format.combine(
      baseFields(),
      timestampFormat,
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    const consoleFilter = winston.format((info) => {
      if (info.type === 'http_request') {
        return false;
      }
      return info;
    });

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          timestampFormat,
          consoleFilter(),
          consoleFormat,
        ),
        handleExceptions: true,
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: fileFormat,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 14,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        format: fileFormat,
        maxsize: 20 * 1024 * 1024,
        maxFiles: 7,
      }),
    ];

    if (esUrl) {
      const esTransport = new ElasticsearchTransport({
        level: 'info',
        clientOpts: {
          node: esUrl,
          auth: {
            username: configService.get('ELASTICSEARCH_USERNAME') || 'elastic',
            password: configService.get('ELASTICSEARCH_PASSWORD') || 'changeme',
          },
        },
        indexPrefix: `${appName}-logs`,
        indexSuffixPattern: 'YYYY.MM.DD',
        transformer: (logData) => ({
          '@timestamp': logData.timestamp || new Date().toISOString(),
          severity: logData.level,
          message: logData.message,
          context: logData.meta?.context || 'App',
          service: appName,
          environment,
          trace: logData.meta?.trace,
          ...logData.meta,
        }),
      });

      esTransport.on('error', (err) => {
        process.stderr.write(
          `[AppLogger] Elasticsearch transport error: ${err.message}\n`,
        );
      });

      transports.push(esTransport);
    }

    this.logger = winston.createLogger({
      level: isDev ? 'debug' : 'info',
      transports,
      exitOnError: false,
    });
  }

  public setContext(context: string): this {
    this.context = context;
    return this;
  }

  public log(message: string, meta?: Record<string, unknown> | string): void {
    const context = typeof meta === 'string' ? meta : this.context;
    const extra = typeof meta === 'object' ? meta : {};
    this.logger.info({ message, context, ...extra });
  }

  public error(
    message: string,
    trace?: string,
    meta?: Record<string, unknown> | string,
  ): void {
    const context = typeof meta === 'string' ? meta : this.context;
    const extra = typeof meta === 'object' ? meta : {};
    this.logger.error({ message, context, trace, ...extra });
  }

  public warn(message: string, meta?: Record<string, unknown> | string): void {
    const context = typeof meta === 'string' ? meta : this.context;
    const extra = typeof meta === 'object' ? meta : {};
    this.logger.warn({ message, context, ...extra });
  }

  public debug(message: string, meta?: Record<string, unknown> | string): void {
    const context = typeof meta === 'string' ? meta : this.context;
    const extra = typeof meta === 'object' ? meta : {};
    this.logger.debug({ message, context, ...extra });
  }

  public verbose(
    message: string,
    meta?: Record<string, unknown> | string,
  ): void {
    const context = typeof meta === 'string' ? meta : this.context;
    const extra = typeof meta === 'object' ? meta : {};
    this.logger.verbose({ message, context, ...extra });
  }

  public logRequest(data: {
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
    ip?: string;
    userAgent?: string;
    userId?: string | number;
    requestId?: string;
  }): void {
    this.logger.info({
      message: `${data.method} ${data.url} ${data.statusCode} ${data.durationMs}ms`,
      context: 'HTTP',
      type: 'http_request',
      ...data,
    });
  }
}
