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
import { auditContextMiddleware } from '../src/modules/audit/audit-context.middleware';
import { PrismaService } from '../src/database/prisma/prisma.service';

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`${label} timed out after ${ms}ms — soft-skipping`);
          resolve(null);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Boot the Nest app for live-DB suites; returns null if Prisma is down or boot hangs. */
export async function createLiveE2eApp(options?: {
  forbidNonWhitelisted?: boolean;
  interceptors?: NestInterceptor[];
  filters?: ExceptionFilter[];
}): Promise<INestApplication | null> {
  const boot = createE2eApp(options);
  const app = await withTimeout(boot, 180_000, 'createE2eApp');
  if (!app) {
    void boot.then((a) => a.close()).catch(() => undefined);
    return null;
  }
  const prisma = app.get(PrismaService);
  if (!prisma.isConnected) {
    console.warn(
      'E2E_USE_LIVE_DB=true but Prisma is not connected; skipping live journey',
    );
    await app.close();
    return null;
  }
  return app;
}

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
  app.use(auditContextMiddleware);

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
