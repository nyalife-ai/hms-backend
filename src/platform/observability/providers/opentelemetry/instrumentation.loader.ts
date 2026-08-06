import { ModuleResolver, tryLoadDriver } from '../load-optional';

export type InstrumentationName =
  | 'http'
  | 'nestjs'
  | 'prisma'
  | 'typeorm'
  | 'redis'
  | 'bullmq'
  | 'kafka'
  | 'rabbitmq'
  | 'nats'
  | 'ws'
  | 'cron';

export const ALL_INSTRUMENTATION_NAMES: readonly InstrumentationName[] =
  Object.freeze([
    'http',
    'nestjs',
    'prisma',
    'typeorm',
    'redis',
    'bullmq',
    'kafka',
    'rabbitmq',
    'nats',
    'ws',
    'cron',
  ]);

const INSTRUMENTATION_PACKAGES: Readonly<Record<InstrumentationName, string>> =
  Object.freeze({
    http: '@opentelemetry/instrumentation-http',
    nestjs: '@opentelemetry/instrumentation-nestjs-core',
    prisma: '@prisma/instrumentation',
    typeorm: 'opentelemetry-instrumentation-typeorm',
    redis: '@opentelemetry/instrumentation-redis-4',
    bullmq: '@opentelemetry/instrumentation-bullmq',
    kafka: '@opentelemetry/instrumentation-kafkajs',
    rabbitmq: '@opentelemetry/instrumentation-amqplib',
    nats: '@opentelemetry/instrumentation-nats',
    ws: '@opentelemetry/instrumentation-ws',
    cron: '@opentelemetry/instrumentation-cron',
  });

export interface LoadedInstrumentation {
  readonly name: InstrumentationName;
  readonly packageName: string;
  readonly instance: unknown;
}

type InstrumentationConstructor = new (config?: unknown) => unknown;

/**
 * Loads whichever instrumentation packages are installed, skipping the rest.
 * Every package here is optional; auto-instrumentation degrades to "none
 * loaded" instead of crashing when the driver is absent.
 */
export function loadInstrumentations(
  names: readonly InstrumentationName[],
  resolver?: ModuleResolver,
): readonly LoadedInstrumentation[] {
  const results: LoadedInstrumentation[] = [];
  for (const name of names) {
    const packageName = INSTRUMENTATION_PACKAGES[name];
    const loaded = tryLoadDriver<Record<string, unknown>>(
      packageName,
      resolver,
    );
    if (!loaded) {
      continue;
    }
    const Ctor = Object.values(loaded).find(
      (value): value is InstrumentationConstructor =>
        typeof value === 'function',
    );
    if (!Ctor) {
      continue;
    }
    results.push({ name, packageName, instance: new Ctor() });
  }
  return Object.freeze(results);
}
