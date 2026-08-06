import { Test } from '@nestjs/testing';
import {
  AUDIT_SINK,
  AUTH_STRATEGIES,
  AuthGuard,
  AuthenticationService,
  DEFAULT_AUTH_STRATEGY,
  InMemoryAuditSink,
  InMemoryRateLimitStore,
  InMemorySessionStore,
  RATE_LIMIT_STORE,
  RateLimitService,
  SESSION_STORE,
  SecurityModule,
  type AuthStrategy,
  type RateLimitStore,
  type SessionStore,
  type AuditSink,
} from '..';

describe('SecurityModule wiring', () => {
  const strategy: AuthStrategy = {
    name: 'test',
    validate: async () => ({ id: 'u1', roles: ['user'] }),
  };

  it('boots a complete Nest TestingModule with strategies and stores', async () => {
    const sessionStore = new InMemorySessionStore();
    const rateLimitStore = new InMemoryRateLimitStore();
    const auditSink = new InMemoryAuditSink();
    const moduleRef = await Test.createTestingModule({
      imports: [
        SecurityModule.forRoot({
          authStrategies: [strategy],
          defaultAuthStrategy: 'test',
          sessionStore,
          rateLimitStore,
          auditSink,
          isProduction: true,
        }),
      ],
    }).compile();

    expect(moduleRef.get(AuthenticationService)).toBeInstanceOf(
      AuthenticationService,
    );
    expect(moduleRef.get(AuthGuard)).toBeInstanceOf(AuthGuard);
    expect(moduleRef.get(RateLimitService)).toBeInstanceOf(RateLimitService);
    expect(moduleRef.get(AUTH_STRATEGIES)).toEqual([strategy]);
    expect(moduleRef.get(DEFAULT_AUTH_STRATEGY)).toBe('test');
    expect(moduleRef.get(SESSION_STORE)).toBe(sessionStore);
    expect(moduleRef.get(RATE_LIMIT_STORE)).toBe(rateLimitStore);
    expect(moduleRef.get(AUDIT_SINK)).toBe(auditSink);

    await expect(
      moduleRef.get(AuthenticationService).authenticate('test', {}),
    ).resolves.toEqual({ id: 'u1', roles: ['user'] });
  });

  it('allows in-memory defaults outside production', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SecurityModule.forRoot({
          isProduction: false,
          authStrategies: [strategy],
        }),
      ],
    }).compile();
    expect(moduleRef.get(DEFAULT_AUTH_STRATEGY)).toBe('test');
    expect(moduleRef.get(SESSION_STORE)).toBeDefined();
    expect(moduleRef.get(RATE_LIMIT_STORE)).toBeDefined();
    expect(moduleRef.get(AUDIT_SINK)).toBeDefined();
  });

  it('allows in-memory defaults in production only with allowInMemory', () => {
    expect(() =>
      SecurityModule.forRoot({
        isProduction: true,
        authStrategies: [strategy],
      }),
    ).toThrow(/sessionStore is required/);

    expect(() =>
      SecurityModule.forRoot({
        isProduction: true,
        allowInMemory: true,
        authStrategies: [strategy],
      }),
    ).not.toThrow();
  });

  it('fails fast in production without distributed stores or strategies', () => {
    const sessionStore = {} as SessionStore;
    const rateLimitStore = {} as RateLimitStore;
    const auditSink = {} as AuditSink;

    expect(() => SecurityModule.forRoot({ isProduction: true })).toThrow(
      /sessionStore is required/,
    );

    expect(() =>
      SecurityModule.forRoot({
        isProduction: true,
        sessionStore,
      }),
    ).toThrow(/rateLimitStore is required/);

    expect(() =>
      SecurityModule.forRoot({
        isProduction: true,
        sessionStore,
        rateLimitStore,
      }),
    ).toThrow(/auditSink is required/);

    expect(() =>
      SecurityModule.forRoot({
        isProduction: true,
        sessionStore,
        rateLimitStore,
        auditSink,
      }),
    ).toThrow(/at least one authStrategy/);
  });

  it('never silently defaults to an unregistered jwt strategy', () => {
    expect(() =>
      SecurityModule.forRoot({
        isProduction: false,
        defaultAuthStrategy: 'jwt',
      }),
    ).toThrow(/not registered/);

    const module = SecurityModule.forRoot({ isProduction: false });
    const defaultProvider = (
      module.providers as ReadonlyArray<{
        provide?: unknown;
        useValue?: unknown;
      }>
    ).find((provider) => provider.provide === DEFAULT_AUTH_STRATEGY);
    expect(defaultProvider?.useValue).toBe('');
    expect(defaultProvider?.useValue).not.toBe('jwt');
  });

  it('resolves production from NODE_ENV and skips InMemoryAuditSink token for external sinks', () => {
    const previous = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      expect(() => SecurityModule.forRoot()).toThrow(
        /sessionStore is required/,
      );
    } finally {
      if (previous === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = previous;
      }
    }

    process.env['NODE_ENV'] = 'test';
    try {
      const module = SecurityModule.forRoot({
        authStrategies: [strategy],
        auditSink: {
          write: async () => undefined,
        },
      });
      const hasInMemoryToken = (
        module.providers as ReadonlyArray<{ provide?: unknown }>
      ).some((provider) => provider.provide === InMemoryAuditSink);
      expect(hasInMemoryToken).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = previous;
      }
    }
  });

  it('requires an explicit default when multiple strategies are registered', () => {
    expect(() =>
      SecurityModule.forRoot({
        isProduction: false,
        authStrategies: [strategy, { ...strategy, name: 'other' }],
      }),
    ).toThrow(/defaultAuthStrategy must be set/);
  });
});
