import {
  type CallHandler,
  ForbiddenException,
  type DynamicModule,
  type ExecutionContext,
  type MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { NextFunction, Response } from 'express';
import { firstValueFrom, Observable, of } from 'rxjs';
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from '../../../core';
import { ConnectionResolver } from '../isolation/connection-resolver';
import { TenantGuard } from '../isolation/tenant-guard';
import { TenantConfigurationService } from '../tenant-configuration.service';
import {
  PrincipalTenantAccessEvaluator,
  TENANT_ACCESS_EVALUATOR,
} from '../tenant-access.evaluator';
import { TenantContext } from '../tenant-context';
import { TenantContextInterceptor } from '../tenant-context.interceptor';
import { TenantContextMiddleware } from '../tenant-context.middleware';
import { TenancyModule } from '../tenancy.module';
import { TenantRegistry } from '../tenant-registry';
import { TenantResolver } from '../tenant-resolver';
import type {
  PrincipalTenantRequest,
  TenantAccessEvaluator,
  TenantConfiguration,
  TenantPrincipal,
} from '../tenancy.types';

const tenant = (
  id: string,
  isolation: TenantConfiguration['isolation'] = 'shared-database',
  connection?: Readonly<Record<string, unknown>>,
): TenantConfiguration => ({
  id,
  name: `Tenant ${id}`,
  isolation,
  settings: { theme: `${id}-theme`, enabled: false },
  metadata: { region: `${id}-region` },
  connection,
});

const executionContext = (
  request: Readonly<PrincipalTenantRequest>,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

const principal = (
  id: string,
  tenantIds: readonly string[],
): TenantPrincipal => ({ id, tenantIds });

describe('TenantContext', () => {
  it('requires an active tenant and supports synchronous scopes', () => {
    const context = new TenantContext();
    expect(context.current()).toBeUndefined();
    expect(() => context.requireCurrent()).toThrow(
      'No tenant is active in the current context',
    );

    const alpha = tenant('alpha');
    expect(context.run(alpha, () => context.requireCurrent())).toBe(alpha);
    expect(context.current()).toBeUndefined();
  });

  it('isolates concurrent asynchronous tenant scopes without leakage', async () => {
    const context = new TenantContext();
    const observations: string[] = [];
    let releaseAlpha: (() => void) | undefined;
    let releaseBeta: (() => void) | undefined;
    const alphaGate = new Promise<void>((resolve) => {
      releaseAlpha = resolve;
    });
    const betaGate = new Promise<void>((resolve) => {
      releaseBeta = resolve;
    });

    const alphaWork = context.run(tenant('alpha'), async () => {
      observations.push(context.requireCurrent().id);
      releaseBeta?.();
      await alphaGate;
      observations.push(context.requireCurrent().id);
    });
    const betaWork = context.run(tenant('beta'), async () => {
      observations.push(context.requireCurrent().id);
      releaseAlpha?.();
      await betaGate;
      observations.push(context.requireCurrent().id);
    });

    await Promise.all([alphaWork, betaWork]);
    expect(observations).toEqual(['alpha', 'beta', 'alpha', 'beta']);
    expect(context.current()).toBeUndefined();
  });
});

describe('TenantRegistry', () => {
  it('registers immutable tenant copies and lists them', () => {
    const registry = new TenantRegistry();
    const original = tenant(' alpha ', 'schema-per-tenant', {
      schema: 'alpha_schema',
    });
    const registered = registry.register({
      ...original,
      name: ' Alpha ',
    });

    expect(registered.id).toBe('alpha');
    expect(registered.name).toBe('Alpha');
    expect(registry.get(' alpha ')).toBe(registered);
    expect(registry.list()).toEqual([registered]);
    expect(Object.isFrozen(registered.settings)).toBe(true);
    expect(Object.isFrozen(registered.metadata)).toBe(true);
    expect(Object.isFrozen(registered.connection)).toBe(true);
    expect(Object.isFrozen(registry.list())).toBe(true);
  });

  it('supports tenants without connection details', () => {
    const registry = new TenantRegistry();
    expect(registry.register(tenant('alpha')).connection).toBeUndefined();
  });

  it('rejects invalid, duplicate, and unknown tenants', () => {
    const registry = new TenantRegistry();
    expect(() => registry.register({ ...tenant(' '), name: 'valid' })).toThrow(
      ValidationException,
    );
    expect(() => registry.register({ ...tenant('valid'), name: ' ' })).toThrow(
      ValidationException,
    );
    registry.register(tenant('alpha'));
    expect(() => registry.register(tenant('alpha'))).toThrow(ConflictException);
    expect(() => registry.get('missing')).toThrow(NotFoundException);
  });
});

describe('TenantResolver', () => {
  const registry = new TenantRegistry();

  beforeAll(() => {
    registry.register(tenant('alpha'));
    registry.register(tenant('beta'));
  });

  it('resolves default and custom headers case-insensitively', () => {
    const defaultResolver = new TenantResolver(registry, {
      strategy: 'header',
    });
    const customResolver = new TenantResolver(registry, {
      strategy: 'header',
      headerName: 'Tenant',
    });

    expect(
      defaultResolver.resolve({ headers: { 'X-Tenant-ID': ' alpha ' } }).id,
    ).toBe('alpha');
    expect(
      customResolver.resolve({ headers: { TENANT: ['beta', 'alpha'] } }).id,
    ).toBe('beta');
  });

  it('rejects missing, empty, and unknown header tenants', () => {
    const resolver = new TenantResolver(registry, { strategy: 'header' });
    expect(() => resolver.resolve({})).toThrow(ValidationException);
    expect(() => resolver.resolve({ headers: { 'x-tenant-id': ' ' } })).toThrow(
      ValidationException,
    );
    expect(() =>
      resolver.resolve({ headers: { 'x-tenant-id': 'unknown' } }),
    ).toThrow(NotFoundException);
  });

  it('resolves configured subdomains from all supported host sources', () => {
    const configured = new TenantResolver(registry, {
      strategy: 'subdomain',
      baseDomain: 'Example.COM',
    });
    const unrestricted = new TenantResolver(registry, {
      strategy: 'subdomain',
    });

    expect(configured.resolve({ hostname: 'alpha.example.com' }).id).toBe(
      'alpha',
    );
    expect(configured.resolve({ host: 'beta.example.com:443' }).id).toBe(
      'beta',
    );
    expect(
      unrestricted.resolve({ headers: { host: 'alpha.localhost' } }).id,
    ).toBe('alpha');
    expect(
      unrestricted.resolve({ headers: { host: ['beta.localhost'] } }).id,
    ).toBe('beta');
  });

  it('rejects missing and invalid configured subdomains', () => {
    const resolver = new TenantResolver(registry, {
      strategy: 'subdomain',
      baseDomain: 'example.com',
    });
    expect(() => resolver.resolve({})).toThrow(ValidationException);
    expect(() => resolver.resolve({ hostname: 'alpha.invalid.test' })).toThrow(
      ValidationException,
    );
  });

  it('resolves explicit tenant ids and rejects missing ids', () => {
    const resolver = new TenantResolver(registry, { strategy: 'explicit' });
    expect(resolver.resolve({ explicitTenantId: 'alpha' }).id).toBe('alpha');
    expect(resolver.resolve({ tenantId: 'beta' }).id).toBe('beta');
    expect(() => resolver.resolve({})).toThrow(ValidationException);
  });
});

describe('TenantConfigurationService', () => {
  it('reads current settings and metadata with safe defaults', () => {
    const context = new TenantContext();
    const service = new TenantConfigurationService(context);
    const inherited = Object.create({ leaked: 'secret' }) as Record<
      string,
      unknown
    >;
    inherited.owned = 'safe';
    const configured: TenantConfiguration = {
      ...tenant('alpha'),
      settings: inherited,
    };

    context.run(configured, () => {
      expect(service.settings()).toBe(inherited);
      expect(service.metadata()).toEqual({ region: 'alpha-region' });
      expect(service.getSetting('owned', 'fallback')).toBe('safe');
      expect(service.getSetting('leaked', 'fallback')).toBe('fallback');
      expect(service.getSetting('missing', false)).toBe(false);
      expect(service.getMetadata('region', 'fallback')).toBe('alpha-region');
      expect(service.getMetadata('missing', 'fallback')).toBe('fallback');
    });
  });
});

describe('ConnectionResolver', () => {
  it('returns the same shared descriptor without tenant-specific data', () => {
    const shared = Object.freeze({ url: 'postgres://shared' });
    const resolver = new ConnectionResolver(shared);
    const alpha = resolver.resolve(tenant('alpha'));
    const beta = resolver.resolve(tenant('beta'));

    expect(alpha).toEqual({
      isolation: 'shared-database',
      connection: shared,
    });
    expect(beta).toEqual(alpha);
    expect(alpha.connection).toBe(shared);
    expect('tenantId' in alpha).toBe(false);
  });

  it('creates isolated schema descriptors with safe fallbacks', () => {
    const resolver = new ConnectionResolver();
    expect(
      resolver.resolve(
        tenant('alpha', 'schema-per-tenant', {
          tenantId: 'alpha',
          schema: 'alpha_schema',
        }),
      ),
    ).toMatchObject({ tenantId: 'alpha', schema: 'alpha_schema' });
    expect(
      resolver.resolve(tenant('beta', 'schema-per-tenant', { schema: '' })),
    ).toMatchObject({ tenantId: 'beta', schema: 'beta' });
    expect(
      resolver.resolve(tenant('gamma', 'schema-per-tenant', { schema: 42 })),
    ).toMatchObject({ tenantId: 'gamma', schema: 'gamma' });
  });

  it('creates isolated database descriptors without leaking connections', () => {
    const resolver = new ConnectionResolver();
    const alpha = resolver.resolve(
      tenant('alpha', 'database-per-tenant', {
        tenantId: 'alpha',
        database: 'alpha_db',
        url: 'postgres://alpha',
      }),
    );
    const beta = resolver.resolve(
      tenant('beta', 'database-per-tenant', {
        database: '',
        url: 10,
      }),
    );

    expect(alpha).toMatchObject({
      tenantId: 'alpha',
      database: 'alpha_db',
      url: 'postgres://alpha',
    });
    expect(beta).toMatchObject({
      tenantId: 'beta',
      database: 'beta',
      url: undefined,
    });
    expect(alpha.connection).not.toBe(beta.connection);
    expect(alpha.connection).not.toEqual(beta.connection);
  });

  it('rejects mismatched strategies and another tenant connection', () => {
    const resolver = new ConnectionResolver();
    expect(() =>
      resolver.resolve(tenant('alpha'), 'schema-per-tenant'),
    ).toThrow(ValidationException);
    expect(() =>
      resolver.resolve(
        tenant('alpha', 'database-per-tenant', { tenantId: 'beta' }),
      ),
    ).toThrow("Connection descriptor belongs to tenant 'beta'");
    expect(() =>
      resolver.resolve(
        tenant('alpha', 'database-per-tenant', { tenantId: 99 }),
      ),
    ).toThrow("Connection descriptor belongs to tenant '99'");
    expect(() =>
      resolver.resolve(
        tenant('alpha', 'database-per-tenant', { tenantId: true }),
      ),
    ).toThrow("Connection descriptor belongs to tenant 'true'");
    expect(() =>
      resolver.resolve(
        tenant('alpha', 'database-per-tenant', { tenantId: 3n }),
      ),
    ).toThrow("Connection descriptor belongs to tenant '3'");
    expect(() =>
      resolver.resolve(
        tenant('alpha', 'database-per-tenant', {
          tenantId: { id: 'other' },
        }),
      ),
    ).toThrow(/belongs to tenant/);
  });
});

describe('TenantContextInterceptor', () => {
  const registry = new TenantRegistry();
  registry.register(tenant('alpha'));
  registry.register(tenant('beta'));
  const resolver = new TenantResolver(registry, { strategy: 'header' });
  const evaluator = new PrincipalTenantAccessEvaluator();

  it('isolates concurrent downstream request lifecycles', async () => {
    const context = new TenantContext();
    const interceptor = new TenantContextInterceptor(
      context,
      resolver,
      evaluator,
    );
    const execute = (
      tenantId: string,
      actor: TenantPrincipal,
    ): Promise<unknown> =>
      firstValueFrom(
        interceptor.intercept(
          executionContext({
            headers: { 'x-tenant-id': tenantId },
            principal: actor,
          }),
          {
            handle: () =>
              new Observable<string>((subscriber) => {
                const before = context.requireCurrent().id;
                setImmediate(() => {
                  subscriber.next(
                    `${before}:${context.requireCurrent().id}:${context.currentPrincipal()?.id}`,
                  );
                  subscriber.complete();
                });
              }),
          },
        ),
      );

    await expect(
      Promise.all([
        execute('alpha', principal('user-a', ['alpha'])),
        execute('beta', principal('user-b', ['beta'])),
      ]),
    ).resolves.toEqual(['alpha:alpha:user-a', 'beta:beta:user-b']);
    expect(context.current()).toBeUndefined();
    expect(context.currentPrincipal()).toBeUndefined();
  });

  it('rejects spoofed, missing, and unresolved tenants before invocation', async () => {
    const context = new TenantContext();
    const interceptor = new TenantContextInterceptor(
      context,
      resolver,
      evaluator,
    );
    const next: CallHandler = { handle: jest.fn(() => of('unsafe')) };
    const invoke = (request: PrincipalTenantRequest): Promise<unknown> =>
      firstValueFrom(interceptor.intercept(executionContext(request), next));

    await expect(
      invoke({
        headers: { 'x-tenant-id': 'beta' },
        principal: principal('alpha-user', ['alpha']),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      invoke({ headers: { 'x-tenant-id': 'alpha' } }),
    ).rejects.toThrow('principal');
    await expect(
      invoke({
        headers: { 'x-tenant-id': 'alpha' },
        principal: null as unknown as TenantPrincipal,
      }),
    ).rejects.toThrow('principal');
    await expect(
      invoke({
        headers: { 'x-tenant-id': 'alpha' },
        principal: { id: '   ', tenantIds: ['alpha'] },
      }),
    ).rejects.toThrow('principal');
    await expect(
      invoke({
        headers: { 'x-tenant-id': 'missing' },
        principal: principal('user', ['missing']),
      }),
    ).rejects.toThrow('Tenant access');
    expect(next.handle).not.toHaveBeenCalled();
  });
});

describe('TenantContextMiddleware', () => {
  const registry = new TenantRegistry();
  registry.register(tenant('alpha'));
  registry.register(tenant('beta'));
  const resolver = new TenantResolver(registry, { strategy: 'header' });
  const evaluator = new PrincipalTenantAccessEvaluator();
  const response = {} as Response;

  const invoke = (
    middleware: TenantContextMiddleware,
    request: PrincipalTenantRequest,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      middleware.use(request, response, ((error?: unknown) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }) as NextFunction);
    });

  it('authorizes, attaches request.tenant, and binds ALS for next()', async () => {
    const context = new TenantContext();
    const middleware = new TenantContextMiddleware(
      context,
      resolver,
      evaluator,
    );
    const request: PrincipalTenantRequest = {
      headers: { 'x-tenant-id': 'alpha' },
      principal: principal('user-a', ['alpha']),
    };
    let observed: string | undefined;

    await new Promise<void>((resolve, reject) => {
      middleware.use(request, response, (() => {
        try {
          observed = `${context.requireCurrent().id}:${context.currentPrincipal()?.id}:${request.tenant?.id}`;
          resolve();
        } catch (error) {
          reject(error);
        }
      }) as NextFunction);
    });

    expect(observed).toBe('alpha:user-a:alpha');
    expect(request.tenant?.id).toBe('alpha');
    expect(context.current()).toBeUndefined();
  });

  it('isolates concurrent middleware requests without tenant leakage', async () => {
    const context = new TenantContext();
    const middleware = new TenantContextMiddleware(
      context,
      resolver,
      evaluator,
    );
    let releaseAlpha: (() => void) | undefined;
    let releaseBeta: (() => void) | undefined;
    const alphaGate = new Promise<void>((resolve) => {
      releaseAlpha = resolve;
    });
    const betaGate = new Promise<void>((resolve) => {
      releaseBeta = resolve;
    });

    const run = (
      tenantId: string,
      actor: TenantPrincipal,
      gate: Promise<void>,
      releaseOther: (() => void) | undefined,
    ): Promise<string> =>
      new Promise((resolve, reject) => {
        const request: PrincipalTenantRequest = {
          headers: { 'x-tenant-id': tenantId },
          principal: actor,
        };
        middleware.use(request, response, (() => {
          void (async () => {
            try {
              const before = `${context.requireCurrent().id}:${request.tenant?.id}`;
              releaseOther?.();
              await gate;
              const after = `${context.requireCurrent().id}:${context.currentPrincipal()?.id}`;
              resolve(`${before}|${after}`);
            } catch (error) {
              reject(error);
            }
          })();
        }) as NextFunction);
      });

    await expect(
      Promise.all([
        run('alpha', principal('user-a', ['alpha']), alphaGate, releaseBeta),
        run('beta', principal('user-b', ['beta']), betaGate, releaseAlpha),
      ]),
    ).resolves.toEqual(['alpha:alpha|alpha:user-a', 'beta:beta|beta:user-b']);
    expect(context.current()).toBeUndefined();
  });

  it('rejects unauthorized and missing tenants before next()', async () => {
    const context = new TenantContext();
    const middleware = new TenantContextMiddleware(
      context,
      resolver,
      evaluator,
    );
    const next = jest.fn();

    await expect(
      invoke(middleware, {
        headers: { 'x-tenant-id': 'beta' },
        principal: principal('alpha-user', ['alpha']),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      invoke(middleware, { headers: { 'x-tenant-id': 'alpha' } }),
    ).rejects.toThrow('principal');
    await expect(
      invoke(middleware, {
        headers: { 'x-tenant-id': 'alpha' },
        principal: null as unknown as TenantPrincipal,
      }),
    ).rejects.toThrow('principal');
    await expect(
      invoke(middleware, {
        headers: { 'x-tenant-id': 'missing' },
        principal: principal('user', ['missing']),
      }),
    ).rejects.toThrow('Tenant access');
    await expect(
      invoke(middleware, {
        headers: { 'x-tenant-id': 'alpha' },
        principal: { id: '   ', tenantIds: ['alpha'] },
      }),
    ).rejects.toThrow('principal');

    middleware.use(
      {
        headers: { 'x-tenant-id': 'beta' },
        principal: principal('alpha-user', ['alpha']),
      },
      response,
      next as NextFunction,
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenException);
  });
});

describe('TenantGuard', () => {
  const registry = new TenantRegistry();
  registry.register(tenant('alpha'));
  registry.register(tenant('beta'));
  const resolver = new TenantResolver(registry, { strategy: 'header' });
  const evaluator = new PrincipalTenantAccessEvaluator();
  const principal = { id: 'u1', tenantId: 'alpha' };

  it('allows only requests matching the active tenant context', async () => {
    const context = new TenantContext();
    const guard = new TenantGuard(context, resolver, evaluator);
    await expect(
      context.run(
        tenant('alpha'),
        () =>
          guard.canActivate(
            executionContext({
              headers: { 'x-tenant-id': 'alpha' },
              principal,
            }),
          ),
        principal,
      ),
    ).resolves.toBe(true);
  });

  it('denies cross-tenant access and requests without context', async () => {
    const context = new TenantContext();
    const guard = new TenantGuard(context, resolver, evaluator);
    await expect(
      context.run(
        tenant('alpha'),
        () =>
          guard.canActivate(
            executionContext({
              headers: { 'x-tenant-id': 'beta' },
              principal,
            }),
          ),
        principal,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      context.run(
        tenant('alpha'),
        () =>
          guard.canActivate(
            executionContext({
              headers: { 'x-tenant-id': 'alpha' },
              principal: { id: 'u2', tenantId: 'alpha' },
            }),
          ),
        principal,
      ),
    ).rejects.toThrow('principal mismatch');
    await expect(
      context.run(
        tenant('alpha'),
        () =>
          guard.canActivate(
            executionContext({
              headers: { 'x-tenant-id': 'missing' },
              principal,
            }),
          ),
        principal,
      ),
    ).rejects.toThrow('Tenant access');
    await expect(
      guard.canActivate(
        executionContext({
          headers: { 'x-tenant-id': 'alpha' },
          principal,
        }),
      ),
    ).rejects.toThrow('No active tenant context');
  });
});

describe('TenancyModule', () => {
  it('requires explicit production tenancy dependencies', () => {
    expect(() => TenancyModule.register()).toThrow(
      'Production tenancy requires',
    );
    const registry = new TenantRegistry();
    registry.register(tenant('alpha'));
    const resolver = new TenantResolver(registry, { strategy: 'explicit' });
    const evaluator: TenantAccessEvaluator = {
      canAccess: () => true,
    };
    const production = TenancyModule.register({
      registry,
      tenantResolver: resolver,
      accessEvaluator: evaluator,
      globalInterceptor: false,
    });
    expect(production.providers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: APP_INTERCEPTOR }),
      ]),
    );
  });

  it('registers defaults and configured providers', async () => {
    const defaults: DynamicModule = TenancyModule.register({
      environment: 'test',
    });
    expect(defaults.module).toBe(TenancyModule);
    expect(defaults.providers?.length).toBeGreaterThan(6);
    expect(defaults.exports?.length).toBeGreaterThan(6);
    await (
      await Test.createTestingModule({ imports: [defaults] }).compile()
    ).close();

    const configured = await Test.createTestingModule({
      imports: [
        TenancyModule.register({
          environment: 'test',
          tenants: [tenant('alpha')],
          resolver: { strategy: 'explicit' },
          sharedConnection: { url: 'postgres://shared' },
        }),
      ],
    }).compile();
    expect(configured.get(TenantRegistry).get('alpha').id).toBe('alpha');
    expect(
      configured.get(TenantResolver).resolve({ tenantId: 'alpha' }).id,
    ).toBe('alpha');
    expect(
      configured.get(ConnectionResolver).resolve(tenant('alpha')).connection,
    ).toEqual({ url: 'postgres://shared' });
    expect(configured.get(TenantContext)).toBeInstanceOf(TenantContext);
    expect(configured.get(TenantConfigurationService)).toBeInstanceOf(
      TenantConfigurationService,
    );
    expect(configured.get(TenantGuard)).toBeInstanceOf(TenantGuard);
    expect(configured.get(TenantContextInterceptor)).toBeInstanceOf(
      TenantContextInterceptor,
    );
    expect(configured.get(TenantContextMiddleware)).toBeInstanceOf(
      TenantContextMiddleware,
    );
    expect(configured.get(TENANT_ACCESS_EVALUATOR)).toBeInstanceOf(
      PrincipalTenantAccessEvaluator,
    );
    await configured.close();
  });

  it('conditionally applies TenantContextMiddleware', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn(() => ({ forRoutes }));
    const consumer = { apply } as unknown as MiddlewareConsumer;

    new TenancyModule({ environment: 'test' }).configure(consumer);
    expect(apply).toHaveBeenCalledWith(TenantContextMiddleware);
    expect(forRoutes).toHaveBeenCalledWith({
      path: '*',
      method: RequestMethod.ALL,
    });

    apply.mockClear();
    forRoutes.mockClear();
    new TenancyModule({ environment: 'development' }).configure(consumer);
    expect(apply).toHaveBeenCalledWith(TenantContextMiddleware);

    apply.mockClear();
    forRoutes.mockClear();
    new TenancyModule({
      environment: 'test',
      applyMiddleware: false,
    }).configure(consumer);
    expect(apply).not.toHaveBeenCalled();

    apply.mockClear();
    // Default constructor options (undefined inject) must not apply middleware.
    new TenancyModule().configure(consumer);
    expect(apply).not.toHaveBeenCalled();

    apply.mockClear();
    forRoutes.mockClear();
    const registry = new TenantRegistry();
    registry.register(tenant('alpha'));
    new TenancyModule({
      environment: 'production',
      applyMiddleware: true,
      registry,
      tenantResolver: new TenantResolver(registry, { strategy: 'explicit' }),
      accessEvaluator: { canAccess: () => true },
    }).configure(consumer);
    expect(apply).toHaveBeenCalledWith(TenantContextMiddleware);
    expect(forRoutes).toHaveBeenCalledWith({
      path: '*',
      method: RequestMethod.ALL,
    });
  });
});
