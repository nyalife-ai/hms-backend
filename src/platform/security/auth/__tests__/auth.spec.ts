import {
  HttpException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { DomainException, ValidationException } from '../../../../core';
import {
  ApiKeyAuthStrategy,
  AuthenticationService,
  AuthGuard,
  JwtAuthStrategy,
  OAuth2AuthStrategy,
  SessionAuthStrategy,
  TokenService,
  type AccessTokenPayload,
  type AuthPrincipal,
  type AuthStrategy,
  type IdentityProvider,
  type TokenSigner,
} from '../..';
import {
  CsrfGuard,
  InMemoryRateLimitStore,
  RateLimitGuard,
  RateLimitService,
  SecurityHeadersMiddleware,
  ValidationPipeline,
} from '../../http';
import { InMemorySessionStore } from '../../session';

function context(
  request: object,
  handler: () => void = (): void => undefined,
): ExecutionContext {
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

const principal: AuthPrincipal = { id: 'u1', roles: ['user'] };

describe('authentication security', () => {
  it('orchestrates named and missing strategies', async () => {
    const strategy: AuthStrategy = {
      name: 'test',
      validate: async () => principal,
    };
    const authentication = new AuthenticationService([strategy]);
    await expect(authentication.authenticate('test', {})).resolves.toBe(
      principal,
    );
    await expect(
      authentication.authenticate('missing', {}),
    ).resolves.toBeNull();
  });

  it('issues, verifies, expires, and refreshes tokens', async () => {
    let verified: AccessTokenPayload | null = null;
    const signer: TokenSigner = {
      sign: async (payload) => {
        verified = payload;
        return 'access';
      },
      verify: async () => verified,
      randomToken: () => 'refresh',
    };
    const tokens = new TokenService(signer);
    await expect(
      tokens.issue({ subject: 'u1', roles: [] }, 60),
    ).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    await expect(tokens.verify('access')).resolves.toMatchObject({
      subject: 'u1',
    });
    await expect(
      tokens.refresh('refresh', { subject: 'u1', roles: [] }, 60),
    ).resolves.toMatchObject({ accessToken: 'access' });
    await expect(tokens.issue({ subject: 'u1', roles: [] }, 0)).rejects.toThrow(
      DomainException,
    );
    expect(() => tokens.refresh('', { subject: 'u1', roles: [] }, 60)).toThrow(
      DomainException,
    );
    verified = null;
    await expect(tokens.verify('bad')).resolves.toBeNull();
  });

  it('validates JWT, API key, session, and OAuth strategies', async () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = new JwtAuthStrategy({
      verify: async (token) =>
        token === 'good'
          ? {
              subject: 'u1',
              roles: ['user'],
              issuedAt: now,
              expiresAt: now + 60,
            }
          : null,
    });
    await expect(jwt.validate({ token: 'good' })).resolves.toMatchObject({
      id: 'u1',
    });
    await expect(jwt.validate({ token: 'bad' })).resolves.toBeNull();
    await expect(jwt.validate({})).resolves.toBeNull();

    const key = 'key';
    const digest = createHash('sha256').update(key).digest('hex');
    const api = new ApiKeyAuthStrategy({
      findByHash: async (hash) =>
        hash === digest ? { hash, active: true, principal } : null,
    });
    await expect(api.validate({ apiKey: key })).resolves.toBe(principal);
    const mismatchedApi = new ApiKeyAuthStrategy({
      findByHash: async () => ({
        hash: 'different',
        active: true,
        principal,
      }),
    });
    await expect(mismatchedApi.validate({ apiKey: key })).resolves.toBeNull();
    const inactiveApi = new ApiKeyAuthStrategy({
      findByHash: async () => ({ hash: digest, active: false, principal }),
    });
    await expect(inactiveApi.validate({ apiKey: key })).resolves.toBeNull();
    await expect(api.validate({})).resolves.toBeNull();

    const sessions = new InMemorySessionStore();
    await sessions.save({
      id: 's',
      principalId: 'u1',
      roles: ['user'],
      deviceId: 'd',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1_000),
      refreshTokenHash: 'h',
      revoked: false,
    });
    const session = new SessionAuthStrategy(sessions);
    await expect(session.validate({ sessionId: 's' })).resolves.toMatchObject({
      id: 'u1',
    });
    await expect(
      session.validate({ sessionId: 'missing' }),
    ).resolves.toBeNull();
    await expect(session.validate({})).resolves.toBeNull();

    const identity: IdentityProvider = {
      authenticate: async () => principal,
      getUserInfo: async (token) => (token ? principal : null),
      exchangeCode: async () => ({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: new Date(),
      }),
    };
    const oauth = new OAuth2AuthStrategy(identity);
    await expect(oauth.validate({ token: 'access' })).resolves.toBe(principal);
    await expect(
      oauth.validate({ authorizationCode: 'code', redirectUri: 'uri' }),
    ).resolves.toBe(principal);
    await expect(oauth.validate({})).resolves.toBeNull();
  });

  it('guards authentication and rejects missing principals', async () => {
    const reflector = new Reflector();
    const authentication = new AuthenticationService([
      {
        name: 'jwt',
        validate: async ({ token }) => (token === 'ok' ? principal : null),
      },
    ]);
    const guard = new AuthGuard(reflector, authentication, 'jwt');
    const request = {
      headers: {
        authorization: 'Bearer ok',
        'x-api-key': 'api-key',
        'x-session-id': 'session',
      },
    };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty('user', principal);
    await expect(guard.canActivate(context({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('enforces CSRF and rate limits', async () => {
    const csrf = new CsrfGuard();
    expect(csrf.canActivate(context({ method: 'GET', headers: {} }))).toBe(
      true,
    );
    expect(
      csrf.canActivate(
        context({
          method: 'POST',
          headers: { 'x-csrf-token': 'token' },
          cookies: { 'csrf-token': 'token' },
        }),
      ),
    ).toBe(true);
    expect(
      csrf.canActivate(
        context({
          method: 'POST',
          headers: { 'x-csrf-token': ['token'] },
          cookies: { 'csrf-token': 'token' },
        }),
      ),
    ).toBe(true);
    expect(() =>
      csrf.canActivate(context({ method: 'POST', headers: {}, cookies: {} })),
    ).toThrow(UnauthorizedException);
    expect(() =>
      csrf.canActivate(
        context({
          method: 'POST',
          headers: { 'x-csrf-token': 'different' },
          cookies: { 'csrf-token': 'token' },
        }),
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      csrf.canActivate(
        context({
          method: 'POST',
          headers: { 'x-csrf-token': 'token' },
          cookies: null,
        }),
      ),
    ).toThrow(UnauthorizedException);
    expect(() =>
      csrf.canActivate(
        context({
          method: 'POST',
          headers: { 'x-csrf-token': 'token' },
          cookies: 'not-an-object',
        }),
      ),
    ).toThrow(UnauthorizedException);

    const guard = new RateLimitGuard(
      new RateLimitService(new InMemoryRateLimitStore()),
      1,
      1_000,
    );
    const request = {
      headers: { 'x-api-key': 'api-key' },
      ip: '127.0.0.1',
    };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    await expect(guard.canActivate(context(request))).rejects.toThrow(
      HttpException,
    );

    const defaults = new RateLimitGuard(
      new RateLimitService(new InMemoryRateLimitStore()),
    );
    await expect(
      defaults.canActivate(context({ headers: {}, ip: '127.0.0.2' })),
    ).resolves.toBe(true);
  });

  it('runs validators and security header middleware', async () => {
    const pipeline = new ValidationPipeline<string>([
      { validate: async (value) => (value ? [] : ['required']) },
    ]);
    await expect(pipeline.transform('ok')).resolves.toBe('ok');
    await expect(pipeline.transform('')).rejects.toThrow(ValidationException);
    await expect(
      new ValidationPipeline().transform('unvalidated'),
    ).resolves.toBe('unvalidated');

    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string): void => {
        headers.set(name, value);
      },
    };
    let nextCalled = false;
    new SecurityHeadersMiddleware().use(
      {} as never,
      response as never,
      (): void => {
        nextCalled = true;
      },
    );
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(nextCalled).toBe(true);
  });

  it('emits fallback metadata for guards with injectable dependencies', () => {
    jest.isolateModules(() => {
      jest.doMock('@nestjs/core', () => ({ Reflector: undefined }));
      jest.doMock('../services/authentication.service', () => ({
        AuthenticationService: undefined,
      }));
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mocking
        require('../guards/auth.guard'),
      ).not.toThrow();

      jest.doMock('../../http/rate-limit.service', () => ({
        RateLimitService: undefined,
      }));
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mocking
        require('../../http/rate-limit.guard'),
      ).not.toThrow();
    });
    jest.dontMock('@nestjs/core');
    jest.dontMock('../services/authentication.service');
    jest.dontMock('../../http/rate-limit.service');
  });
});
