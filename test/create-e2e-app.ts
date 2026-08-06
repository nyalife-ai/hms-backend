/**
 * Shared Nest testing application bootstrap mirroring `main.ts` pipeline pieces
 * that e2e suites assert on (request-id middleware, validation pipe).
 */

import type { NestInterceptor, ExceptionFilter } from '@nestjs/common';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { RequestIdMiddleware } from '../src/common/middleware/request-id.middleware';

export async function createE2eApp(options?: {
  forbidNonWhitelisted?: boolean;
  interceptors?: NestInterceptor[];
  filters?: ExceptionFilter[];
}): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use((req: Request, res: Response, next: NextFunction) =>
    requestIdMiddleware.use(req, res, next),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: options?.forbidNonWhitelisted ?? true,
    }),
  );

  for (const interceptor of options?.interceptors ?? []) {
    app.useGlobalInterceptors(interceptor);
  }
  for (const filter of options?.filters ?? []) {
    app.useGlobalFilters(filter);
  }

  await app.init();
  return app;
}
