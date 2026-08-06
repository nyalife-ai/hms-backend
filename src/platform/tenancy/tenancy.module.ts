import {
  type DynamicModule,
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  Optional,
  type Provider,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConnectionResolver } from './isolation/connection-resolver';
import { TenantGuard } from './isolation/tenant-guard';
import {
  PrincipalTenantAccessEvaluator,
  TENANT_ACCESS_EVALUATOR,
} from './tenant-access.evaluator';
import { TenantConfigurationService } from './tenant-configuration.service';
import { TenantContext } from './tenant-context';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantContextMiddleware } from './tenant-context.middleware';
import { TenantRegistry } from './tenant-registry';
import { TenantResolver } from './tenant-resolver';
import type {
  TenantAccessEvaluator,
  TenantConfiguration,
  TenantResolverOptions,
} from './tenancy.types';

export type TenancyEnvironment = 'production' | 'development' | 'test';

export interface TenancyModuleOptions {
  readonly environment?: TenancyEnvironment;
  readonly registry?: TenantRegistry;
  readonly tenantResolver?: TenantResolver;
  readonly accessEvaluator?: TenantAccessEvaluator;
  readonly tenants?: ReadonlyArray<Readonly<TenantConfiguration>>;
  readonly resolver?: Readonly<TenantResolverOptions>;
  readonly sharedConnection?: Readonly<Record<string, unknown>>;
  readonly globalInterceptor?: boolean;
  /**
   * When `true`, always bind {@link TenantContextMiddleware}.
   * When `false`, never bind it.
   * When unset, bind for non-production environments only.
   *
   * Prefer {@link TenantContextInterceptor} for Nest request-lifecycle ALS
   * binding; middleware targets early Express-layer consumers.
   */
  readonly applyMiddleware?: boolean;
}

export const TENANCY_MODULE_OPTIONS = Symbol('TENANCY_MODULE_OPTIONS');

@Module({})
export class TenancyModule implements NestModule {
  public constructor(
    @Optional()
    @Inject(TENANCY_MODULE_OPTIONS)
    private readonly options: TenancyModuleOptions = {},
  ) {}

  public static register(options: TenancyModuleOptions = {}): DynamicModule {
    const environment = options.environment ?? 'production';
    const usesDevelopmentDefaults = environment !== 'production';
    if (
      !usesDevelopmentDefaults &&
      (!options.registry || !options.tenantResolver || !options.accessEvaluator)
    ) {
      throw new Error(
        'Production tenancy requires registry, tenantResolver, and accessEvaluator',
      );
    }
    const resolverOptions = options.resolver ?? { strategy: 'header' };
    const sharedConnection = Object.freeze({
      ...(options.sharedConnection ?? {}),
    });
    const registry =
      options.registry ??
      TenancyModule.createDevelopmentRegistry(options.tenants ?? []);
    const tenantResolver =
      options.tenantResolver ?? new TenantResolver(registry, resolverOptions);
    const accessEvaluator =
      options.accessEvaluator ?? new PrincipalTenantAccessEvaluator();
    const providers: ReadonlyArray<Provider> = [
      { provide: TENANCY_MODULE_OPTIONS, useValue: options },
      TenantContext,
      { provide: TenantRegistry, useValue: registry },
      { provide: TenantResolver, useValue: tenantResolver },
      { provide: TENANT_ACCESS_EVALUATOR, useValue: accessEvaluator },
      {
        provide: ConnectionResolver,
        useFactory: (): ConnectionResolver =>
          new ConnectionResolver(sharedConnection),
      },
      {
        provide: TenantConfigurationService,
        useFactory: (context: TenantContext): TenantConfigurationService =>
          new TenantConfigurationService(context),
        inject: [TenantContext],
      },
      {
        provide: TenantGuard,
        useFactory: (
          context: TenantContext,
          resolver: TenantResolver,
          evaluator: TenantAccessEvaluator,
        ): TenantGuard => new TenantGuard(context, resolver, evaluator),
        inject: [TenantContext, TenantResolver, TENANT_ACCESS_EVALUATOR],
      },
      {
        provide: TenantContextInterceptor,
        useFactory: (
          context: TenantContext,
          resolver: TenantResolver,
          evaluator: TenantAccessEvaluator,
        ): TenantContextInterceptor =>
          new TenantContextInterceptor(context, resolver, evaluator),
        inject: [TenantContext, TenantResolver, TENANT_ACCESS_EVALUATOR],
      },
      {
        provide: TenantContextMiddleware,
        useFactory: (
          context: TenantContext,
          resolver: TenantResolver,
          evaluator: TenantAccessEvaluator,
        ): TenantContextMiddleware =>
          new TenantContextMiddleware(context, resolver, evaluator),
        inject: [TenantContext, TenantResolver, TENANT_ACCESS_EVALUATOR],
      },
    ];
    const globalProvider: Provider[] =
      options.globalInterceptor === false
        ? []
        : [
            {
              provide: APP_INTERCEPTOR,
              useExisting: TenantContextInterceptor,
            },
          ];

    return {
      module: TenancyModule,
      providers: [...providers, ...globalProvider],
      exports: [
        TenantContext,
        TenantRegistry,
        TenantResolver,
        TENANT_ACCESS_EVALUATOR,
        TenantConfigurationService,
        ConnectionResolver,
        TenantGuard,
        TenantContextInterceptor,
        TenantContextMiddleware,
      ],
    };
  }

  public configure(consumer: MiddlewareConsumer): void {
    if (!this.shouldApplyMiddleware()) {
      return;
    }
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }

  private shouldApplyMiddleware(): boolean {
    if (this.options.applyMiddleware === true) {
      return true;
    }
    if (this.options.applyMiddleware === false) {
      return false;
    }
    const environment = this.options.environment ?? 'production';
    return environment !== 'production';
  }

  private static createDevelopmentRegistry(
    tenants: ReadonlyArray<Readonly<TenantConfiguration>>,
  ): TenantRegistry {
    const registry = new TenantRegistry();
    for (const tenant of tenants) {
      registry.register(tenant);
    }
    return registry;
  }
}
