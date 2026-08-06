import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { DomainException, ValidationException } from '../../../core';
import {
  AbacEngine,
  AuditService,
  AwsSecretsProvider,
  AzureKeyVaultProvider,
  BcryptPasswordHasher,
  BruteForceProtector,
  Can,
  EncryptionService,
  EnvSecretProvider,
  GcpSecretProvider,
  InMemoryAuditSink,
  InMemoryBruteForceProtector,
  InMemoryBruteForceStore,
  InMemoryRateLimitStore,
  InMemorySessionStore,
  MfaService,
  PasswordPolicy,
  PasswordService,
  PermissionEvaluator,
  RateLimitService,
  RbacEngine,
  SanitizerService,
  SecretsService,
  SessionService,
  ThrottlingService,
  VaultSecretProvider,
  buildCorsOptions,
  type MfaProvider,
  type RemoteSecretConfig,
  type SecretHttpClient,
} from '..';

describe('security platform primitives', () => {
  it('hashes passwords and enforces policy', async () => {
    const hasher = new BcryptPasswordHasher(4);
    const service = new PasswordService(hasher, new PasswordPolicy());
    const digest = await service.hash('GoodPassword1!');
    await expect(service.verify('GoodPassword1!', digest)).resolves.toBe(true);
    await expect(service.verify('wrong', digest)).resolves.toBe(false);
    expect(() => new PasswordPolicy().validate('weak')).toThrow(
      ValidationException,
    );
    expect(() => new PasswordPolicy().validate('WEAK1!')).toThrow(
      ValidationException,
    );
  });

  it('locks and resets brute-force identities', () => {
    const protector = new BruteForceProtector(2, 100, 100);
    protector.recordFailure('user', 0);
    protector.recordFailure('user', 1);
    expect(() => protector.assertAllowed('user', 2)).toThrow(DomainException);
    expect(() => protector.assertAllowed('user', 102)).not.toThrow();
    protector.recordSuccess('user');
    expect(() => protector.assertAllowed('user', 2)).not.toThrow();
  });

  it('validates brute-force config, bounds state, and accepts injected stores', () => {
    expect(() => new BruteForceProtector({ maxFailures: 0 })).toThrow(
      DomainException,
    );
    expect(() => new BruteForceProtector({ windowMs: -1 })).toThrow(
      DomainException,
    );
    expect(() => new BruteForceProtector({ lockoutMs: 1.5 })).toThrow(
      DomainException,
    );
    expect(() => new BruteForceProtector({ maxEntries: 0 })).toThrow(
      DomainException,
    );

    const bounded = new BruteForceProtector({
      maxFailures: 2,
      windowMs: 100,
      lockoutMs: 100,
      maxEntries: 1,
    });
    bounded.recordFailure('a', 0);
    expect(() => bounded.recordFailure('b', 0)).toThrow(DomainException);
    bounded.recordFailure('a', 150);
    expect(bounded.size()).toBe(1);

    const custom = {
      data: new Map<
        string,
        { count: number; firstFailureAt: number; lockedUntil?: number }
      >(),
      get(key: string) {
        return this.data.get(key);
      },
      set(
        key: string,
        state: { count: number; firstFailureAt: number; lockedUntil?: number },
      ) {
        this.data.set(key, state);
      },
      delete(key: string) {
        this.data.delete(key);
      },
      get size() {
        return this.data.size;
      },
      keys() {
        return this.data.keys();
      },
    };
    const distributed = new BruteForceProtector({
      maxFailures: 1,
      windowMs: 50,
      lockoutMs: 50,
      store: custom,
    });
    distributed.recordFailure('remote', 0);
    expect(() => distributed.assertAllowed('remote', 1)).toThrow(
      DomainException,
    );
    distributed.recordSuccess('remote');
    distributed.recordFailure('stale', 0);
    distributed.assertAllowed('stale', 100);
    expect(custom.size).toBe(0);

    custom.set('prelocked', {
      count: 0,
      firstFailureAt: 0,
      lockedUntil: 500,
    });
    const preserving = new BruteForceProtector({
      maxFailures: 5,
      windowMs: 1_000,
      lockoutMs: 1_000,
      store: custom,
    });
    preserving.recordFailure('prelocked', 10);
    expect(() => preserving.assertAllowed('prelocked', 20)).toThrow(
      DomainException,
    );

    const memoryStore = new InMemoryBruteForceStore();
    memoryStore.set('x', { count: 1, firstFailureAt: 0 });
    expect([...memoryStore.keys()]).toEqual(['x']);
    memoryStore.cleanup(200, 50);
    expect(memoryStore.size).toBe(0);

    const ghostStore = {
      data: new Map<string, { count: number; firstFailureAt: number }>(),
      get(key: string) {
        return key === 'ghost' ? undefined : this.data.get(key);
      },
      set(key: string, state: { count: number; firstFailureAt: number }) {
        this.data.set(key, state);
      },
      delete(key: string) {
        this.data.delete(key);
      },
      get size() {
        return this.data.size;
      },
      keys() {
        return ['ghost', ...this.data.keys()][Symbol.iterator]();
      },
    };
    ghostStore.data.set('alive', { count: 1, firstFailureAt: 0 });
    new BruteForceProtector({
      maxFailures: 2,
      windowMs: 50,
      lockoutMs: 50,
      store: ghostStore,
    }).assertAllowed('alive', 100);
  });

  it('evaluates RBAC, ABAC, wildcards, and fluent authorization', async () => {
    const rbac = new RbacEngine();
    const abac = new AbacEngine();
    const evaluator = new PermissionEvaluator(rbac, abac);
    const principal = { id: 'u1', roles: ['admin'], attributes: { team: 'a' } };
    rbac.setRolePermissions('admin', [{ action: '*', resource: 'article' }]);
    await expect(
      Can(principal, evaluator).perform('read').on('article'),
    ).resolves.toBe(true);
    await expect(
      Can(principal, evaluator).perform('read').on('invoice'),
    ).resolves.toBe(false);
    abac.addPolicy({
      name: 'team',
      evaluate: (context) => context.principal.attributes?.['team'] === 'a',
    });
    await expect(
      evaluator.can({ principal, action: 'read', resource: 'invoice' }),
    ).resolves.toBe(true);
    expect(rbac.can({ id: 'u2', roles: ['missing'] }, 'read', 'article')).toBe(
      false,
    );
  });

  it('creates, refreshes, revokes, lists, and cleans sessions', async () => {
    const store = new InMemorySessionStore();
    const service = new SessionService(store);
    const session = await service.create({
      principalId: 'u1',
      roles: ['user'],
      deviceId: 'phone',
      refreshToken: 'refresh',
      ttlMs: 10_000,
    });
    await expect(
      service.create({
        principalId: 'u2',
        deviceId: 'laptop',
        refreshToken: 'refresh-2',
        ttlMs: 10_000,
      }),
    ).resolves.toMatchObject({ roles: [] });
    await expect(
      service.create({
        principalId: 'u3',
        deviceId: 'tablet',
        refreshToken: 'refresh-3',
        ttlMs: 0,
      }),
    ).rejects.toThrow(DomainException);
    await expect(service.listDevices('u1')).resolves.toHaveLength(1);
    await expect(
      service.refresh(session.id, 'refresh', 20_000),
    ).resolves.toMatchObject({
      id: session.id,
    });
    await expect(service.refresh(session.id, 'wrong', 20_000)).rejects.toThrow(
      DomainException,
    );
    await service.revoke(session.id);
    await expect(
      service.refresh(session.id, 'refresh', 20_000),
    ).rejects.toThrow(DomainException);
    await store.save({ ...session, id: 'expired', expiresAt: new Date(0) });
    await expect(service.cleanupExpired(new Date())).resolves.toBe(1);
    await expect(service.cleanupExpired()).resolves.toBe(0);
    await service.revoke('missing');
    await store.delete(session.id);
    await expect(store.find(session.id)).resolves.toBeNull();
  });

  it('applies atomic in-memory limits and key precedence', async () => {
    const limiter = new RateLimitService(new InMemoryRateLimitStore());
    const results = await Promise.all(
      Array.from({ length: 3 }, () => limiter.consume('ip:x', 2, 1_000)),
    );
    expect(results.map(({ allowed }) => allowed)).toEqual([true, true, false]);
    expect(limiter.key({ ip: 'x', apiKey: 'a', userId: 'u' })).toBe('user:u');
    const apiKey = limiter.key({ ip: 'x', apiKey: 'super-secret-api-key' });
    expect(apiKey).toMatch(/^api:[0-9a-f]{64}$/);
    expect(apiKey).not.toContain('super-secret-api-key');
    expect(limiter.key({})).toBe('ip:unknown');
  });

  it('rejects invalid rate-limit configs and bounds memory', async () => {
    const limiter = new RateLimitService(new InMemoryRateLimitStore());
    await expect(limiter.consume('', 1, 1_000)).rejects.toThrow(
      DomainException,
    );
    await expect(limiter.consume('k', 0, 1_000)).rejects.toThrow(
      DomainException,
    );
    await expect(limiter.consume('k', 1, -5)).rejects.toThrow(DomainException);
    await expect(limiter.consume('k', 1.5, 1_000)).rejects.toThrow(
      DomainException,
    );
    expect(() => new InMemoryRateLimitStore({ maxEntries: 0 })).toThrow(
      DomainException,
    );

    const store = new InMemoryRateLimitStore({ maxEntries: 1 });
    await expect(store.increment('a', 1_000, 0)).resolves.toMatchObject({
      count: 1,
    });
    await expect(store.increment('b', 1_000, 0)).rejects.toThrow(
      DomainException,
    );
    await expect(store.increment('a', 1_000, 0)).resolves.toMatchObject({
      count: 2,
    });
    await expect(store.increment('b', 1_000, 1_001)).resolves.toMatchObject({
      count: 1,
    });
    expect(store.size()).toBe(1);
  });

  it('calculates throttling delays and builds CORS options', () => {
    const throttling = new ThrottlingService();
    expect(throttling.calculateDelay(2, 2)).toBe(0);
    expect(throttling.calculateDelay(4, 2, 50, 75)).toBe(75);
    expect(
      buildCorsOptions({ origins: ['https://example.test'] }),
    ).toMatchObject({
      credentials: true,
      maxAge: 600,
    });
  });

  it('sanitizes and escapes hostile input', () => {
    const sanitizer = new SanitizerService();
    expect(
      sanitizer.stripXss('<script>alert(1)</script><a onclick="x">ok</a>'),
    ).toBe('<a>ok</a>');
    expect(sanitizer.escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('encrypts with rotation metadata and RSA OAEP', () => {
    const key = randomBytes(32);
    const encryption = new EncryptionService([{ version: 'v1', key }], 'v1');
    const encrypted = encryption.encrypt('secret');
    expect(encryption.decrypt(encrypted)).toBe('secret');
    expect(encryption.decrypt(encryption.encrypt(''))).toBe('');
    expect(() => new EncryptionService([], 'missing')).toThrow(DomainException);
    expect(
      () =>
        new EncryptionService(
          [
            { version: 'v1', key },
            { version: 'v1', key: randomBytes(32) },
          ],
          'v1',
        ),
    ).toThrow(DomainException);
    expect(() =>
      new EncryptionService(
        [{ version: 'short', key: randomBytes(16) }],
        'short',
      ).encrypt('secret'),
    ).toThrow(DomainException);

    const tampered = {
      ...encrypted,
      ciphertext: encryption.encrypt('x').ciphertext,
    };
    expect(() => encryption.decrypt(tampered)).toThrow(DomainException);
    expect(() =>
      encryption.decrypt({
        ...encrypted,
        algorithm: 'aes-128-gcm' as 'aes-256-gcm',
      }),
    ).toThrow(DomainException);
    expect(() =>
      encryption.decrypt({ ...encrypted, iv: 'not-base64!!!' }),
    ).toThrow(DomainException);
    expect(() =>
      encryption.decrypt({
        ...encrypted,
        iv: Buffer.alloc(8).toString('base64'),
      }),
    ).toThrow(DomainException);
    expect(() =>
      encryption.decrypt({
        ...encrypted,
        authTag: Buffer.alloc(8).toString('base64'),
      }),
    ).toThrow(DomainException);
    expect(() =>
      encryption.decrypt({ ...encrypted, keyVersion: 'missing' }),
    ).toThrow(DomainException);
    expect(() => encryption.decrypt({ ...encrypted, keyVersion: '' })).toThrow(
      DomainException,
    );
    expect(() =>
      encryption.decrypt({ ...encrypted, ciphertext: '@@@@' }),
    ).toThrow(DomainException);
    expect(() =>
      encryption.decrypt({ ...encrypted, ciphertext: 'ab==' }),
    ).toThrow(DomainException);
    expect(() => encryption.decrypt({ ...encrypted, iv: 'ab==' })).toThrow(
      DomainException,
    );

    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    expect(
      encryption.rsaDecrypt(
        encryption.rsaEncrypt('rsa', publicKey),
        privateKey,
      ),
    ).toBe('rsa');
  });

  it('resolves environment and remote secrets', async () => {
    const config: RemoteSecretConfig = {
      baseUrl: 'https://secrets',
      token: 't',
    };
    const http: SecretHttpClient = {
      get: async <T>(url: string): Promise<T> => ({ value: url }) as T,
    };
    const providers = [
      new VaultSecretProvider(config, http),
      new AwsSecretsProvider(config, http),
      new AzureKeyVaultProvider(config, http),
      new GcpSecretProvider(config, http),
    ];
    for (const provider of providers) {
      await expect(provider.get('name')).resolves.toContain('name');
    }
    await expect(
      new SecretsService([new EnvSecretProvider({ SECRET: 'value' })]).get(
        'SECRET',
      ),
    ).resolves.toBe('value');
    await expect(
      new SecretsService([new EnvSecretProvider({})]).get('missing'),
    ).rejects.toThrow(DomainException);

    process.env['PLATFORM_COVERAGE_SECRET'] = 'from-process';
    await expect(
      new EnvSecretProvider().get('PLATFORM_COVERAGE_SECRET'),
    ).resolves.toBe('from-process');
    delete process.env['PLATFORM_COVERAGE_SECRET'];

    const nestedHttp: SecretHttpClient = {
      get: async <T>(): Promise<T> => ({ data: { value: 'nested' } }) as T,
    };
    await expect(
      new VaultSecretProvider({ baseUrl: 'https://secrets' }, nestedHttp).get(
        'name with spaces',
      ),
    ).resolves.toBe('nested');
    const emptyHttp: SecretHttpClient = {
      get: async <T>(): Promise<T> => ({}) as T,
    };
    await expect(
      new VaultSecretProvider({ baseUrl: 'https://secrets' }, emptyHttp).get(
        'missing',
      ),
    ).resolves.toBeNull();
  });

  it('registers MFA providers and records audit events', async () => {
    const provider: MfaProvider = {
      method: 'totp',
      challenge: async (principalId) => ({
        id: principalId,
        method: 'totp',
        expiresAt: new Date(Date.now() + 1_000),
      }),
      verify: async (_id, code) => code === '123456',
    };
    const mfa = new MfaService();
    mfa.register(provider);
    await expect(mfa.challenge('totp', 'u1')).resolves.toMatchObject({
      id: 'u1',
    });
    await expect(mfa.verify('totp', 'u1', '123456')).resolves.toBe(true);
    expect(() => mfa.challenge('sms', 'u1')).toThrow(DomainException);

    const sink = new InMemoryAuditSink();
    await new AuditService(sink).record({
      actor: { id: 'u1', type: 'user' },
      action: 'login',
      resource: 'session',
    });
    expect(sink.all()).toHaveLength(1);
    const boundedSink = new InMemoryAuditSink({ maxEntries: 1 });
    await boundedSink.write({
      actor: { id: 'u1', type: 'user' },
      action: 'login',
      resource: 'session',
      timestamp: new Date(),
    });
    await expect(
      boundedSink.write({
        actor: { id: 'u2', type: 'user' },
        action: 'logout',
        resource: 'session',
        timestamp: new Date(),
      }),
    ).rejects.toThrow(/full/);
  });

  it('uses default password and brute-force settings', () => {
    expect(new BcryptPasswordHasher()).toBeInstanceOf(BcryptPasswordHasher);
    const protector = new BruteForceProtector();
    protector.recordFailure('default-clock');
    expect(() => protector.assertAllowed('default-clock')).not.toThrow();
    expect(new InMemoryBruteForceProtector()).toBeInstanceOf(
      BruteForceProtector,
    );
  });

  it('emits fallback metadata for injectable security services', () => {
    jest.isolateModules(() => {
      jest.doMock('../authorization/rbac.engine', () => ({
        RbacEngine: undefined,
      }));
      jest.doMock('../authorization/abac.engine', () => ({
        AbacEngine: undefined,
      }));
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mocking
        require('../authorization/permission-evaluator'),
      ).not.toThrow();

      jest.doMock('../password/bcrypt-password.hasher', () => ({
        BcryptPasswordHasher: undefined,
      }));
      jest.doMock('../password/password-policy', () => ({
        PasswordPolicy: undefined,
      }));
      expect(() =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mocking
        require('../password/password.service'),
      ).not.toThrow();
    });
    jest.dontMock('../authorization/rbac.engine');
    jest.dontMock('../authorization/abac.engine');
    jest.dontMock('../password/bcrypt-password.hasher');
    jest.dontMock('../password/password-policy');
  });

  it('emits concrete metadata for the process environment type', () => {
    const globals = globalThis as unknown as {
      NodeJS?: { ProcessEnv: new () => unknown };
    };
    globals.NodeJS = { ProcessEnv: class ProcessEnvironment {} };
    try {
      jest.isolateModules(() => {
        expect(() =>
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest mocking
          require('../secrets/env-secret.provider'),
        ).not.toThrow();
      });
    } finally {
      delete globals.NodeJS;
    }
  });
});
