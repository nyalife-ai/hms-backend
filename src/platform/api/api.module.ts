import { DynamicModule, Module, Provider } from '@nestjs/common';
import { HealthService } from './health/health.service';
import { type HealthIndicator } from './health/health-indicator.interface';
import { IdempotencyService } from './idempotency/idempotency.service';
import { type IdempotencyStore } from './idempotency/idempotency-store.interface';
import { InMemoryIdempotencyStore } from './idempotency/in-memory-idempotency.store';
import { OpenApiConfigBuilder } from './openapi/openapi-config.builder';
import { PaginationService } from './pagination/pagination.service';
import { InMemorySearchProvider } from './search/in-memory-search.provider';
import { SortBuilder } from './sorting/sort-builder';
import { FilterParser } from './filtering/filter-parser';
import { VersionResolver } from './versioning/version-resolver';
import { type VersioningOptions } from './versioning/versioning.types';

export const API_SEARCH_PROVIDER = Symbol('API_SEARCH_PROVIDER');
export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

export interface ApiModuleOptions {
  readonly versioning?: VersioningOptions;
  /**
   * External atomic idempotency store. Required in production unless
   * {@link allowInMemoryIdempotency} is set.
   */
  readonly idempotencyStore?: IdempotencyStore;
  readonly idempotencyTtlMilliseconds?: number;
  readonly idempotencyWaitTimeoutMilliseconds?: number;
  /**
   * Explicitly allow the process-local {@link InMemoryIdempotencyStore}.
   * Required to use in-memory defaults in production.
   */
  readonly allowInMemoryIdempotency?: boolean;
  /**
   * Override production detection (defaults to `NODE_ENV === 'production'`).
   * Intended for tests.
   */
  readonly isProduction?: boolean;
  readonly healthIndicators?: readonly HealthIndicator[];
  readonly healthTimeoutMilliseconds?: number;
  readonly paginationDefaultLimit?: number;
  readonly paginationMaxLimit?: number;
}

@Module({})
export class ApiModule {
  public static register(options: ApiModuleOptions = {}): DynamicModule {
    const isProduction =
      options.isProduction ?? process.env['NODE_ENV'] === 'production';
    const allowInMemory =
      options.allowInMemoryIdempotency === true || !isProduction;

    const store =
      options.idempotencyStore ??
      (allowInMemory ? new InMemoryIdempotencyStore() : undefined);

    if (store === undefined) {
      throw new Error(
        'ApiModule: an external atomic idempotencyStore is required in production (or set allowInMemoryIdempotency: true)',
      );
    }

    if (
      isProduction &&
      options.allowInMemoryIdempotency !== true &&
      store instanceof InMemoryIdempotencyStore
    ) {
      throw new Error(
        'ApiModule: InMemoryIdempotencyStore is not allowed in production (or set allowInMemoryIdempotency: true)',
      );
    }

    const providers: Provider[] = [
      { provide: IDEMPOTENCY_STORE, useValue: store },
      {
        provide: IdempotencyService,
        useFactory: (): IdempotencyService =>
          new IdempotencyService(
            store,
            options.idempotencyTtlMilliseconds,
            undefined,
            undefined,
            options.idempotencyWaitTimeoutMilliseconds,
          ),
      },
      {
        provide: HealthService,
        useFactory: (): HealthService =>
          new HealthService(
            options.healthIndicators,
            options.healthTimeoutMilliseconds,
          ),
      },
      {
        provide: PaginationService,
        useFactory: (): PaginationService =>
          new PaginationService(
            options.paginationDefaultLimit,
            options.paginationMaxLimit,
          ),
      },
      {
        provide: VersionResolver,
        useFactory: (): VersionResolver =>
          new VersionResolver(
            options.versioning ?? {
              defaultVersion: '1',
              supportedVersions: ['1'],
            },
          ),
      },
      {
        provide: API_SEARCH_PROVIDER,
        useValue: new InMemorySearchProvider<Readonly<Record<string, unknown>>>(
          [],
        ),
      },
      OpenApiConfigBuilder,
      SortBuilder,
      FilterParser,
    ];
    return {
      module: ApiModule,
      providers,
      exports: [
        IDEMPOTENCY_STORE,
        IdempotencyService,
        HealthService,
        PaginationService,
        VersionResolver,
        API_SEARCH_PROVIDER,
        OpenApiConfigBuilder,
        SortBuilder,
        FilterParser,
      ],
    };
  }
}
