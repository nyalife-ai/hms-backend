import {
  DynamicModule,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  Optional,
  RequestMethod,
} from '@nestjs/common';
import {
  COMPRESSION_OPTIONS,
  CompressionMiddleware,
  CompressionOptions,
} from './compression.middleware';
import { PoolMetrics } from './connection-pool.hooks';

export interface PerformanceModuleOptions {
  readonly compression?: CompressionOptions;
  readonly enableCompressionMiddleware?: boolean;
}

const PERFORMANCE_OPTIONS = Symbol('PERFORMANCE_OPTIONS');

@Module({
  providers: [
    { provide: COMPRESSION_OPTIONS, useValue: {} },
    { provide: PERFORMANCE_OPTIONS, useValue: {} },
    CompressionMiddleware,
    PoolMetrics,
  ],
  exports: [CompressionMiddleware, PoolMetrics],
})
export class PerformanceModule implements NestModule {
  public constructor(
    @Optional()
    @Inject(PERFORMANCE_OPTIONS)
    private readonly options: PerformanceModuleOptions = {},
  ) {}

  public static register(
    options: PerformanceModuleOptions = {},
  ): DynamicModule {
    return {
      module: PerformanceModule,
      providers: [
        {
          provide: COMPRESSION_OPTIONS,
          useValue: options.compression ?? {},
        },
        { provide: PERFORMANCE_OPTIONS, useValue: options },
        CompressionMiddleware,
        PoolMetrics,
      ],
      exports: [CompressionMiddleware, PoolMetrics],
    };
  }

  public configure(consumer: MiddlewareConsumer): void {
    if (this.options.enableCompressionMiddleware === false) {
      return;
    }
    consumer
      .apply(CompressionMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
