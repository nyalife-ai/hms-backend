import type { PrismaClientLike } from '../../../platform/database/prisma/prisma-client.types';
import { loadDriver, type ModuleResolver } from '../../optional-driver';
import { maskConnectionUrl } from '../../configuration';
import type { DatabaseLogger } from '../database-logger.interface';

/** Raw Prisma client surface used by the factory adapter. */
type PrismaDriverClient = {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(work: (client: unknown) => Promise<T>): Promise<T>;
  $queryRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
  $queryRawUnsafe?(query: string, ...values: unknown[]): Promise<unknown>;
};

type PrismaConstructor = new (options: {
  readonly log: readonly string[];
  readonly datasources?: Readonly<{
    db: Readonly<{ url: string }>;
  }>;
}) => PrismaDriverClient;

type PrismaDriver = Readonly<{ PrismaClient: PrismaConstructor }>;

export type PrismaClientFactoryOptions = Readonly<{
  environment?: string;
  datasourceUrl?: string;
  resolver?: ModuleResolver;
  logger?: DatabaseLogger;
}>;

/**
 * Adapts a Prisma driver client to the platform {@link PrismaClientLike} port.
 * Exposes safe `healthCheck` / `queryRaw` instead of `$queryRawUnsafe`.
 */
export function adaptPrismaClient(
  client: PrismaDriverClient,
): PrismaClientLike {
  return {
    $connect: (): Promise<void> => client.$connect(),
    $disconnect: (): Promise<void> => client.$disconnect(),
    $transaction: <T>(work: (tx: unknown) => Promise<T>): Promise<T> =>
      client.$transaction(work),
    healthCheck: (): Promise<unknown> => client.$queryRaw`SELECT 1`,
    queryRaw: (
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<unknown> => {
      if (client.$queryRawUnsafe === undefined) {
        return Promise.reject(
          new Error('Prisma driver does not expose parameterized queryRaw'),
        );
      }
      return client.$queryRawUnsafe(sql, ...params);
    },
  };
}

export function createPrismaClient(
  options: PrismaClientFactoryOptions,
): PrismaClientLike {
  const driver = loadDriver<PrismaDriver>('@prisma/client', options.resolver);
  const log =
    options.environment === 'production'
      ? ['warn', 'error']
      : ['query', 'info', 'warn', 'error'];
  if (options.datasourceUrl !== undefined) {
    options.logger?.debug('Creating Prisma client', {
      datasourceUrl: maskConnectionUrl(options.datasourceUrl),
    });
  }
  const client = new driver.PrismaClient({
    log,
    ...(options.datasourceUrl === undefined
      ? {}
      : { datasources: { db: { url: options.datasourceUrl } } }),
  });
  return adaptPrismaClient(client);
}
