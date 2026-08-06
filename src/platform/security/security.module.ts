import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AbacEngine,
  PermissionEvaluator,
  PolicyGuard,
  RbacEngine,
} from './authorization';
import { AuditService, InMemoryAuditSink, type AuditSink } from './audit';
import { AuthenticationService } from './auth/services/authentication.service';
import { AuthGuard } from './auth/guards/auth.guard';
import type { AuthStrategy } from './auth/strategies/auth-strategy.interface';
import {
  AUDIT_SINK,
  AUTH_STRATEGIES,
  DEFAULT_AUTH_STRATEGY,
  RATE_LIMIT_STORE,
  SESSION_STORE,
} from './auth/tokens/auth.tokens';
import {
  InMemoryRateLimitStore,
  RateLimitGuard,
  RateLimitService,
  SanitizerService,
  SecurityHeadersMiddleware,
  ThrottlingService,
  type RateLimitStore,
} from './http';
import { MfaService } from './mfa';
import {
  BcryptPasswordHasher,
  BruteForceProtector,
  PasswordPolicy,
  PasswordService,
} from './password';
import {
  InMemorySessionStore,
  SessionService,
  type SessionStore,
} from './session';

/**
 * Options for {@link SecurityModule.forRoot}.
 *
 * **API change:** production mode fails fast unless distributed/external
 * `sessionStore`, `rateLimitStore`, `auditSink`, and at least one
 * `authStrategies` entry are supplied — or `allowInMemory: true` is set.
 * In-memory defaults are allowed only when `allowInMemory: true` or the
 * environment is non-production. `defaultAuthStrategy` is never silently
 * set to `'jwt'`; it must match a registered strategy when provided.
 */
export interface SecurityModuleOptions {
  readonly defaultAuthStrategy?: string;
  readonly passwordRounds?: number;
  /** Explicit auth strategies to register with {@link AuthenticationService}. */
  readonly authStrategies?: readonly AuthStrategy[];
  /** External session store. Required in production unless `allowInMemory`. */
  readonly sessionStore?: SessionStore;
  /** External rate-limit store. Required in production unless `allowInMemory`. */
  readonly rateLimitStore?: RateLimitStore;
  /** External audit sink. Required in production unless `allowInMemory`. */
  readonly auditSink?: AuditSink;
  /**
   * Explicitly allow process-local in-memory stores (and empty strategies
   * only when non-production). Required to use in-memory defaults in production.
   */
  readonly allowInMemory?: boolean;
  /**
   * Override production detection (defaults to `NODE_ENV === 'production'`).
   * Intended for tests.
   */
  readonly isProduction?: boolean;
}

@Module({})
export class SecurityModule {
  public static forRoot(options: SecurityModuleOptions = {}): DynamicModule {
    const isProduction =
      options.isProduction ?? process.env['NODE_ENV'] === 'production';
    const allowInMemory = options.allowInMemory === true || !isProduction;
    const authStrategies = options.authStrategies ?? [];

    const sessionStore =
      options.sessionStore ??
      (allowInMemory ? new InMemorySessionStore() : undefined);
    const rateLimitStore =
      options.rateLimitStore ??
      (allowInMemory ? new InMemoryRateLimitStore() : undefined);
    const auditSink =
      options.auditSink ??
      (allowInMemory ? new InMemoryAuditSink() : undefined);

    if (!sessionStore) {
      throw new Error(
        'SecurityModule: sessionStore is required in production (or set allowInMemory: true)',
      );
    }
    if (!rateLimitStore) {
      throw new Error(
        'SecurityModule: rateLimitStore is required in production (or set allowInMemory: true)',
      );
    }
    if (!auditSink) {
      throw new Error(
        'SecurityModule: auditSink is required in production (or set allowInMemory: true)',
      );
    }
    if (isProduction && !options.allowInMemory && authStrategies.length === 0) {
      throw new Error(
        'SecurityModule: at least one authStrategy is required in production (or set allowInMemory: true)',
      );
    }

    const defaultAuthStrategy = SecurityModule.resolveDefaultStrategy(
      options.defaultAuthStrategy,
      authStrategies,
    );

    const providers: Provider[] = [
      Reflector,
      RbacEngine,
      AbacEngine,
      PermissionEvaluator,
      PolicyGuard,
      MfaService,
      {
        provide: BruteForceProtector,
        useFactory: (): BruteForceProtector => new BruteForceProtector(),
      },
      SanitizerService,
      SecurityHeadersMiddleware,
      ThrottlingService,
      AuthGuard,
      AuthenticationService,
      { provide: SESSION_STORE, useValue: sessionStore },
      { provide: RATE_LIMIT_STORE, useValue: rateLimitStore },
      { provide: AUDIT_SINK, useValue: auditSink },
      { provide: AUTH_STRATEGIES, useValue: authStrategies },
      {
        provide: DEFAULT_AUTH_STRATEGY,
        useValue: defaultAuthStrategy,
      },
      {
        provide: SessionService,
        useFactory: (): SessionService => new SessionService(sessionStore),
      },
      {
        provide: BcryptPasswordHasher,
        useFactory: (): BcryptPasswordHasher =>
          new BcryptPasswordHasher(options.passwordRounds ?? 12),
      },
      {
        provide: PasswordPolicy,
        useFactory: (): PasswordPolicy => new PasswordPolicy(),
      },
      {
        provide: PasswordService,
        useFactory: (
          hasher: BcryptPasswordHasher,
          policy: PasswordPolicy,
        ): PasswordService => new PasswordService(hasher, policy),
        inject: [BcryptPasswordHasher, PasswordPolicy],
      },
      {
        provide: RateLimitService,
        useFactory: (): RateLimitService =>
          new RateLimitService(rateLimitStore),
      },
      {
        provide: RateLimitGuard,
        useFactory: (limiter: RateLimitService): RateLimitGuard =>
          new RateLimitGuard(limiter),
        inject: [RateLimitService],
      },
      {
        provide: AuditService,
        useFactory: (): AuditService => new AuditService(auditSink),
      },
    ];

    if (auditSink instanceof InMemoryAuditSink) {
      providers.push({ provide: InMemoryAuditSink, useValue: auditSink });
    }

    return {
      module: SecurityModule,
      providers,
      exports: [
        Reflector,
        RbacEngine,
        AbacEngine,
        PermissionEvaluator,
        PolicyGuard,
        MfaService,
        BruteForceProtector,
        SanitizerService,
        SecurityHeadersMiddleware,
        ThrottlingService,
        AuthGuard,
        AuthenticationService,
        SessionService,
        BcryptPasswordHasher,
        PasswordPolicy,
        PasswordService,
        RateLimitService,
        RateLimitGuard,
        AuditService,
        SESSION_STORE,
        RATE_LIMIT_STORE,
        AUDIT_SINK,
        AUTH_STRATEGIES,
        DEFAULT_AUTH_STRATEGY,
      ],
    };
  }

  private static resolveDefaultStrategy(
    configured: string | undefined,
    strategies: readonly AuthStrategy[],
  ): string {
    if (configured !== undefined) {
      if (!strategies.some((strategy) => strategy.name === configured)) {
        throw new Error(
          `SecurityModule: defaultAuthStrategy '${configured}' is not registered`,
        );
      }
      return configured;
    }
    if (strategies.length === 1) {
      return strategies[0].name;
    }
    if (strategies.length === 0) {
      // Non-production / allowInMemory: no silent 'jwt' default.
      return '';
    }
    throw new Error(
      'SecurityModule: defaultAuthStrategy must be set when multiple auth strategies are registered',
    );
  }
}
