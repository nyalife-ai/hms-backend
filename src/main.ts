import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { HttpMetricsInterceptor } from './common/interceptors/http-metrics.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AppLogger } from './modules/logger/logger.service';
import { MetricsService } from './modules/metrics/metrics.service';

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

/**
 * HTTP bootstrap for the reusable NestJS API scaffold.
 *
 * Pipeline stages (mirrors FoundationModule documentation):
 * 1. request correlation id
 * 2. validation pipe
 * 3. HTTP metrics + structured request logs
 * 4. exception filter with production-safe error redaction
 *
 * Do not import FoundationModule here until AppModule drops the legacy
 * `src/modules` stack — see AppModule JSDoc.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Keep Nest's default logger until AppLogger is wired so DI / env
    // validation failures are visible on stderr (logger:false hid them).
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const logger = app.get(AppLogger);
  logger.setContext('Bootstrap');
  app.useLogger(logger);

  const requestIdMiddleware = new RequestIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestIdMiddleware.use(req, res, next),
  );

  const globalPrefix = config.get<string>('app.globalPrefix', '');
  if (globalPrefix) {
    app.setGlobalPrefix(globalPrefix);
  }

  app.useGlobalFilters(new HttpExceptionFilter(logger));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages:
        config.get<string>('app.environment') === 'production',
    }),
  );

  const metricsService = app.get(MetricsService);
  app.useGlobalInterceptors(new HttpMetricsInterceptor(metricsService, logger));

  const allowedOrigins = config.get<string[]>('app.corsOrigins', [
    'http://localhost:3000',
    'http://localhost:3001',
  ]);

  app.enableCors({
    origin: (origin: string | undefined, callback: CorsOriginCallback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  if (config.get<string>('app.environment') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(config.get<string>('app.name', 'API'))
      .setDescription('Reusable NestJS API scaffold')
      .setVersion(process.env.npm_package_version || '1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();

  const port = config.get<number>('app.port', 3000);
  await app.listen(port);

  logger.log(`API listening on port ${port}`, {
    port,
    environment: config.get<string>('app.environment'),
    orm: config.get<string>('orm.type'),
    docs:
      config.get<string>('app.environment') !== 'production'
        ? '/api/docs'
        : undefined,
  });
}

bootstrap().catch((err: unknown) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
