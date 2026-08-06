import {
  type DynamicModule,
  ForbiddenException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainException } from '../../../../core';
import {
  Auth0IdentityProvider,
  AzureAdIdentityProvider,
  BcryptPasswordHasher,
  GoogleIdentityProvider,
  KeycloakIdentityProvider,
  POLICY_METADATA,
  PermissionEvaluator,
  PolicyGuard,
  RedisRateLimitStore,
  SecurityModule,
  type AuthPrincipal,
  type IdentityProviderConfig,
  type IdentityProviderHttpClient,
  type RedisRateLimitClient,
} from '../..';

function context(request: object, handler: () => void): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: <T>(): T => request as T,
      getResponse: <T>(): T => ({}) as T,
      getNext: <T>(): T => ({}) as T,
    }),
    getHandler: () => handler,
    getClass: () => class Test {},
    getArgs: <T extends unknown[]>(): T => [] as unknown as T,
    getArgByIndex: <T>(): T => undefined as T,
    switchToRpc: () => ({
      getContext: <T>(): T => ({}) as T,
      getData: <T>(): T => ({}) as T,
    }),
    switchToWs: () => ({
      getClient: <T>(): T => ({}) as T,
      getData: <T>(): T => ({}) as T,
      getPattern: (): string => '',
    }),
    getType: <TContext extends string = string>(): TContext =>
      'http' as TContext,
  };
}

describe('identity adapters and module integration', () => {
  const config: IdentityProviderConfig = {
    baseUrl: 'https://identity.test',
    clientId: 'client',
    clientSecret: 'secret',
    enablePasswordGrant: true,
  };
  const principal: AuthPrincipal = { id: 'u1', roles: ['user'] };

  it('supports token, password, authorization-code, and invalid credentials', async () => {
    const requests: Array<{
      readonly url: string;
      readonly body?: Readonly<Record<string, string>>;
    }> = [];
    const http: IdentityProviderHttpClient = {
      request: async <T>(request): Promise<T> => {
        requests.push(request);
        return (
          request.method === 'GET'
            ? principal
            : {
                access_token: 'access',
                refresh_token: 'refresh',
                expires_in: 60,
              }
        ) as T;
      },
    };
    const providers = [
      new KeycloakIdentityProvider(config, http),
      new Auth0IdentityProvider(config, http),
      new AzureAdIdentityProvider(config, http),
      new GoogleIdentityProvider(config, http),
    ];
    for (const provider of providers) {
      await expect(provider.authenticate({ token: 'access' })).resolves.toBe(
        principal,
      );
      await expect(
        provider.authenticate({ username: 'user', password: 'password' }),
      ).resolves.toBe(principal);
      await expect(provider.authenticate({})).resolves.toBeNull();
      await expect(
        provider.exchangeCode('code', 'https://callback'),
      ).resolves.toMatchObject({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      expect(() => provider.exchangeCode('', '')).toThrow(DomainException);
    }
    expect(requests.some(({ url }) => url.includes('/oauth/token'))).toBe(true);
    expect(
      requests.some(({ url }) =>
        url.includes('/protocol/openid-connect/token'),
      ),
    ).toBe(true);
  });

  it('disables ROPC password grant by default and documents auth-code preference', async () => {
    const http: IdentityProviderHttpClient = {
      request: async <T>(): Promise<T> => {
        throw new Error('should not call http for disabled ROPC');
      },
    };
    const provider = new KeycloakIdentityProvider(
      {
        baseUrl: 'https://identity.test',
        clientId: 'client',
        clientSecret: 'secret',
      },
      http,
    );
    await expect(
      provider.authenticate({ username: 'user', password: 'password' }),
    ).rejects.toThrow(DomainException);
    await expect(
      provider.authenticate({ username: 'user', password: 'password' }),
    ).rejects.toThrow(/authorization-code \+ PKCE/i);
  });

  it('delegates Redis rate increments', async () => {
    const client: RedisRateLimitClient = {
      incrementWithExpiry: async (_key, windowMs) => ({
        count: 1,
        resetAt: windowMs,
      }),
    };
    await expect(
      new RedisRateLimitStore(client).increment('key', 100),
    ).resolves.toEqual({
      count: 1,
      resetAt: 100,
    });
  });

  it('allows absent policies and enforces configured policies', async () => {
    const reflector = new Reflector();
    const evaluator = {
      can: async ({ resource }: { readonly resource: string }) =>
        resource === 'allowed',
    } as PermissionEvaluator;
    const guard = new PolicyGuard(reflector, evaluator);
    const noPolicy = (): void => undefined;
    await expect(guard.canActivate(context({}, noPolicy))).resolves.toBe(true);

    const protectedHandler = (): void => undefined;
    Reflect.defineMetadata(
      POLICY_METADATA,
      { action: 'read', resource: 'allowed' },
      protectedHandler,
    );
    await expect(
      guard.canActivate(
        context({ user: { id: 'u1', roles: [] } }, protectedHandler),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context({}, protectedHandler)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates a configurable dynamic module with defaults', () => {
    const defaults: DynamicModule = SecurityModule.forRoot({
      isProduction: false,
    });
    const strategy = {
      name: 'session',
      validate: async () => ({ id: 'u1', roles: [] }),
    };
    const configured: DynamicModule = SecurityModule.forRoot({
      defaultAuthStrategy: 'session',
      passwordRounds: 4,
      authStrategies: [strategy],
      isProduction: false,
    });
    expect(defaults.module).toBe(SecurityModule);
    expect(defaults.providers?.length).toBeGreaterThan(10);
    expect(configured.exports?.length).toBeGreaterThan(10);

    const providers = configured.providers ?? [];
    const findFactory = <T>(token: unknown): T => {
      const provider = providers.find(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          'provide' in entry &&
          (entry as { provide: unknown }).provide === token &&
          'useFactory' in entry,
      ) as { useFactory: (...args: never[]) => T } | undefined;
      if (!provider) {
        throw new Error(`Missing factory for ${String(token)}`);
      }
      return provider;
    };
    const hasherFactory =
      findFactory<() => BcryptPasswordHasher>(BcryptPasswordHasher);
    expect(hasherFactory.useFactory()).toBeInstanceOf(BcryptPasswordHasher);
    const defaultProviders = defaults.providers ?? [];
    const defaultHasher = (
      defaultProviders.find(
        (entry) =>
          typeof entry === 'object' &&
          entry !== null &&
          'provide' in entry &&
          (entry as { provide: unknown }).provide === BcryptPasswordHasher,
      ) as { useFactory: () => BcryptPasswordHasher }
    ).useFactory();
    expect(defaultHasher).toBeInstanceOf(BcryptPasswordHasher);
  });

  it('emits fallback metadata for the policy guard', () => {
    jest.isolateModules(() => {
      jest.doMock('@nestjs/core', () => ({ Reflector: undefined }));
      jest.doMock('../../authorization/permission-evaluator', () => ({
        PermissionEvaluator: undefined,
      }));
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mocking
        require('../../authorization/policy.guard'),
      ).not.toThrow();
    });
    jest.dontMock('@nestjs/core');
    jest.dontMock('../../authorization/permission-evaluator');
  });
});
