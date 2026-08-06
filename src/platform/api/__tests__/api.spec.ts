import {
  API_SEARCH_PROVIDER,
  ApiModule,
  ApiResponse,
  BulkProcessor,
  DependencyHealthIndicator,
  FilterParser,
  HealthService,
  IdempotencyConflictError,
  IdempotencyService,
  InMemoryIdempotencyStore,
  InMemorySearchProvider,
  OpenApiConfigBuilder,
  PaginationService,
  SortBuilder,
  UnsupportedApiVersionError,
  ValidationPipeline,
  VersionResolver,
  createDependencyIndicator,
  type HealthIndicator,
  type HealthTimer,
  type Validator,
} from '..';
import { ValidationException } from '../../../core';

describe('platform API scaffold', () => {
  describe('versioning', () => {
    it('resolves URL, headers, defaults, arrays, and configured header names', () => {
      const fallback = new VersionResolver({
        defaultVersion: '1',
        supportedVersions: ['1', '2'],
      });
      expect(fallback.resolve({ url: '/api/v2/items' })).toBe('2');
      expect(
        fallback.resolve({ url: '/items', headers: { 'accept-version': '2' } }),
      ).toBe('2');
      expect(
        fallback.resolve({
          url: '/items',
          headers: { 'ACCEPT-VERSION': ['2'] },
        }),
      ).toBe('2');
      expect(fallback.resolve({ url: '/items' })).toBe('1');
      expect(
        new VersionResolver({
          defaultVersion: '1',
          supportedVersions: ['1', '2'],
          strategy: 'header',
          headerName: 'X-Version',
        }).resolve({ url: '/api/v1', headers: { 'x-version': '2' } }),
      ).toBe('2');
      expect(
        new VersionResolver({
          defaultVersion: '1',
          supportedVersions: ['1'],
          strategy: 'url',
        }).resolve({
          url: '/not-versioned',
          headers: { 'accept-version': '9' },
        }),
      ).toBe('1');
    });

    it('rejects invalid configuration and unsupported versions', () => {
      expect(
        () =>
          new VersionResolver({ defaultVersion: '1', supportedVersions: [] }),
      ).toThrow('Default version');
      expect(
        () =>
          new VersionResolver({
            defaultVersion: '2',
            supportedVersions: ['1'],
          }),
      ).toThrow();
      const resolver = new VersionResolver({
        defaultVersion: '1',
        supportedVersions: ['1'],
      });
      expect(() => resolver.resolve({ url: '/api/v9' })).toThrow(
        UnsupportedApiVersionError,
      );
      expect(new UnsupportedApiVersionError('9').name).toBe(
        'UnsupportedApiVersionError',
      );
    });
  });

  it('builds reusable OpenAPI configuration', () => {
    const minimal = new OpenApiConfigBuilder().build();
    expect(minimal.info).toEqual({ title: 'API', version: '1.0.0' });
    const config = new OpenApiConfigBuilder()
      .setTitle('Generic')
      .setVersion('2')
      .setDescription('Description')
      .addSecurityScheme('bearer', { type: 'http', scheme: 'bearer' })
      .addCommonResponse('Unauthorized', { description: 'Unauthorized' })
      .build();
    expect(config).toMatchObject({
      openapi: '3.0.0',
      info: { title: 'Generic', version: '2', description: 'Description' },
      components: {
        securitySchemes: { bearer: { type: 'http' } },
        responses: { Unauthorized: { description: 'Unauthorized' } },
      },
    });
    expect(config.components.schemas.Error).toBeDefined();
    expect(config.components.schemas.Pagination).toBeDefined();
  });

  describe('validation and responses', () => {
    it('sanitizes and validates async and sync validators', async () => {
      const validators: readonly Validator<string>[] = [
        {
          sanitize: (value): string => value.trim(),
          validate: (value) => ({ valid: value.length > 0 }),
        },
        { validate: async () => ({ valid: true }) },
      ];
      await expect(
        new ValidationPipeline(validators).run(' ok '),
      ).resolves.toBe('ok');
    });

    it('aggregates explicit and default validation errors', async () => {
      const pipeline = new ValidationPipeline<string>([
        {
          validate: () => ({
            valid: false,
            errors: [{ field: 'x', message: 'bad' }],
          }),
        },
        { validate: () => ({ valid: false }) },
      ]);
      await expect(pipeline.run('x')).rejects.toMatchObject({
        fieldErrors: [
          { field: 'x', message: 'bad' },
          { field: '', message: 'Validation failed' },
        ],
      });
      await expect(pipeline.run('x')).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it('creates discriminated success and error responses', () => {
      expect(ApiResponse.success({ value: 1 })).toMatchObject({
        success: true,
        data: { value: 1 },
      });
      expect(
        ApiResponse.success('ok', { message: 'done', requestId: 'r' }),
      ).toMatchObject({
        message: 'done',
        requestId: 'r',
      });
      expect(ApiResponse.error({ code: 'X', message: 'failed' })).toMatchObject(
        {
          success: false,
          error: { code: 'X', message: 'failed' },
        },
      );
      expect(
        ApiResponse.error({
          code: 'X',
          message: 'failed',
          details: { safe: true },
          requestId: 'r',
        }),
      ).toMatchObject({ error: { details: { safe: true } }, requestId: 'r' });
    });
  });

  describe('pagination, filtering, and sorting', () => {
    it('normalizes offset and cursor pagination', () => {
      const service = new PaginationService(10, 25);
      expect(service.normalizeOffset({})).toEqual({ page: 1, limit: 10 });
      expect(service.normalizeOffset({ page: 2.9, limit: 99 })).toEqual({
        page: 2,
        limit: 25,
      });
      expect(service.normalizeOffset({ page: Number.NaN, limit: 0 })).toEqual({
        page: 1,
        limit: 10,
      });
      expect(service.toOffset({ page: 3, limit: 5 })).toEqual({
        offset: 10,
        limit: 5,
      });
      expect(service.normalizeCursor({ after: 'a', limit: 5 })).toEqual({
        after: 'a',
        limit: 5,
      });
      expect(service.normalizeCursor({})).toEqual({ limit: 10 });
    });

    it('encodes opaque cursors and builds results', () => {
      const service = new PaginationService();
      const cursor = service.encodeCursor('opaque/token');
      expect(service.decodeCursor(cursor)).toBe('opaque/token');
      expect(() => service.encodeCursor('')).toThrow();
      expect(() => service.decodeCursor('%%%')).toThrow();
      expect(() => service.decodeCursor('A')).toThrow();
      expect(
        service.buildResult(['a'], { total: 1, page: 1, limit: 20 }),
      ).toEqual({
        items: ['a'],
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(() => service.buildResult([], { total: -1, limit: 1 })).toThrow(
        RangeError,
      );
      expect(() => new PaginationService(0, 1)).toThrow(RangeError);
      expect(() => new PaginationService(2, 1)).toThrow(RangeError);
    });

    it('parses supported filters and rejects unsafe input', () => {
      const parser = new FilterParser([
        'name',
        'count',
        'created.at',
        'active',
        'x',
      ]);
      expect(
        parser.parse([
          { field: 'name', op: 'equals', value: 'a' },
          { field: 'name', op: 'contains', value: 'b' },
          { field: 'count', op: 'gte', value: 1 },
          { field: 'count', op: 'lte', value: '9' },
          { field: 'created.at', op: 'date', value: '2025-01-01' },
          { field: 'active', op: 'equals', value: true },
        ]),
      ).toHaveLength(6);
      expect(() =>
        parser.parse([{ field: '$where', op: 'equals', value: 1 }]),
      ).toThrow();
      expect(() =>
        parser.parse([{ field: 'secret', op: 'equals', value: 1 }]),
      ).toThrow('not allowed');
      expect(() => new FilterParser(['$where'])).toThrow('allowlist');
      expect(() =>
        parser.parse([{ field: 'x', op: 'ne', value: 1 }]),
      ).toThrow();
      expect(() =>
        parser.parse([{ field: 'x', op: 'contains', value: 1 }]),
      ).toThrow();
      expect(() =>
        parser.parse([{ field: 'x', op: 'gte', value: true }]),
      ).toThrow();
      expect(() =>
        parser.parse([{ field: 'x', op: 'date', value: 'nope' }]),
      ).toThrow();
      expect(() =>
        parser.parse([{ field: 'x', op: 'equals', value: {} }]),
      ).toThrow();
    });

    it('parses multiple sorts and rejects malformed or injected fields', () => {
      const builder = new SortBuilder(['name', 'createdAt']);
      expect(builder.parse('')).toEqual([]);
      expect(builder.parse('name:asc, createdAt:desc')).toEqual([
        { field: 'name', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
      ]);
      expect(() => builder.parse('name')).toThrow();
      expect(() => builder.parse(':asc')).toThrow();
      expect(() => builder.parse('$where:asc')).toThrow();
      expect(() => builder.parse('secret:asc')).toThrow('not allowed');
      expect(() => builder.parse('name:sideways')).toThrow();
      expect(() => new SortBuilder(['$where'])).toThrow('allowlist');
    });
  });

  describe('search and bulk processing', () => {
    const records = [
      { title: 'Alpha', count: 1, empty: null },
      { title: 'beta', count: 2, empty: undefined },
      { title: 'ALPHABET', count: 3, empty: null },
      {
        title: 'typed',
        count: 4,
        empty: null,
        flag: true,
        big: 2n,
        when: new Date('2020-01-01T00:00:00.000Z'),
        nested: { z: 1 },
      },
    ] as const;

    it('searches selected fields with paging and case options', async () => {
      const provider = new InMemorySearchProvider(records);
      await expect(provider.search('alpha')).resolves.toMatchObject({
        total: 2,
      });
      await expect(
        provider.search('Alpha', {
          fields: ['title'],
          caseSensitive: true,
          offset: -1,
          limit: 1,
        }),
      ).resolves.toMatchObject({ total: 1, items: [records[0]] });
      await expect(
        provider.search('3', { fields: ['count'], offset: 0.9, limit: -2 }),
      ).resolves.toMatchObject({ total: 1, items: [] });
      await expect(
        provider.search('x', { fields: ['missing', 'empty'] }),
      ).resolves.toMatchObject({
        total: 0,
      });
      await expect(
        provider.search('2020-01-01', { fields: ['when'] }),
      ).resolves.toMatchObject({ total: 1 });
      await expect(
        provider.search('"z":1', { fields: ['nested'] }),
      ).resolves.toMatchObject({ total: 1 });
      await expect(
        provider.search('true', { fields: ['flag'] }),
      ).resolves.toMatchObject({ total: 1 });
      await expect(
        provider.search('2', { fields: ['big'] }),
      ).resolves.toMatchObject({ total: 1 });
    });

    it('handles validation failures, batches, transaction failures, and recovery', async () => {
      const batches: readonly number[][] = [];
      const seen: number[][] = [];
      const processor = new BulkProcessor<number>({
        batchSize: 2,
        validate: async (item) => {
          if (item === 2) return 'invalid';
          if (item === 3) throw new Error('validator failed');
          if (item === 6) throw 'string failure';
          return item !== 5;
        },
        onBatch: async (items) => {
          seen.push([...items]);
          if (items.includes(4)) throw new Error('transaction failed');
        },
      });
      expect(batches).toEqual([]);
      await expect(processor.process([1, 2, 3, 4, 5, 6, 7])).resolves.toEqual({
        succeeded: 2,
        failed: [
          { index: 1, error: 'invalid' },
          { index: 2, error: 'validator failed' },
          { index: 3, error: 'transaction failed' },
          { index: 4, error: 'Validation failed' },
          { index: 5, error: 'string failure' },
        ],
      });
      expect(seen).toEqual([[1], [4], [7]]);
      await expect(
        new BulkProcessor({ validate: () => true }).process([]),
      ).resolves.toEqual({ succeeded: 0, failed: [] });
      expect(
        () => new BulkProcessor({ batchSize: 0, validate: () => true }),
      ).toThrow(RangeError);
      expect(
        () => new BulkProcessor({ batchSize: 1.5, validate: () => true }),
      ).toThrow(RangeError);
    });
  });

  describe('idempotency', () => {
    it('fingerprints stably, scopes tenants, caches, expires, and detects conflicts', async () => {
      let now = 100;
      const store = new InMemoryIdempotencyStore({ now: () => now });
      const service = new IdempotencyService(store, 10, () => now);
      const first = service.fingerprint({
        method: 'post',
        path: '/resource',
        body: { b: 2, a: [1, null] },
        tenantId: 't1',
        principalId: 'u1',
      });
      expect(
        service.fingerprint({
          method: 'POST',
          path: '/resource',
          body: { a: [1, null], b: 2 },
          tenantId: 't1',
          principalId: 'u1',
        }),
      ).toBe(first);
      expect(
        service.fingerprint({
          method: 'POST',
          path: '/resource',
          body: { a: [1, null], b: 2 },
          tenantId: 't2',
          principalId: 'u1',
        }),
      ).not.toBe(first);
      expect(
        service.scopedKey('key', { method: 'POST', path: '/', tenantId: 'a' }),
      ).toBe('t:a|p:_|k:key');
      const operation = jest.fn(async () => ({ ok: true }));
      await expect(
        service.execute(
          'key',
          {
            method: 'POST',
            path: '/resource',
            body: undefined,
            tenantId: 't1',
          },
          operation,
        ),
      ).resolves.toMatchObject({ replayed: false });
      await expect(
        service.execute(
          'key',
          { method: 'POST', path: '/resource', tenantId: 't1' },
          operation,
        ),
      ).resolves.toMatchObject({ replayed: true });
      expect(operation).toHaveBeenCalledTimes(1);
      await expect(
        service.execute(
          'key',
          { method: 'POST', path: '/resource', tenantId: 't2' },
          operation,
        ),
      ).resolves.toMatchObject({ replayed: false });
      expect(operation).toHaveBeenCalledTimes(2);
      await expect(
        service.execute(
          'key',
          { method: 'PUT', path: '/resource', tenantId: 't1' },
          operation,
        ),
      ).rejects.toBeInstanceOf(IdempotencyConflictError);
      now = 111;
      await expect(
        service.execute(
          'key',
          { method: 'PUT', path: '/resource', tenantId: 't1' },
          operation,
        ),
      ).resolves.toMatchObject({ replayed: false });
      expect(new IdempotencyConflictError().name).toBe(
        'IdempotencyConflictError',
      );
    });

    it('coordinates two service instances on a shared store', async () => {
      const store = new InMemoryIdempotencyStore({ pollIntervalMs: 1 });
      const left = new IdempotencyService(store, 1_000, Date.now, () => 'left');
      const right = new IdempotencyService(
        store,
        1_000,
        Date.now,
        () => 'right',
      );
      let release: ((value: string) => void) | undefined;
      const operation = jest.fn(
        () =>
          new Promise<string>((resolve) => {
            release = resolve;
          }),
      );
      const request = {
        method: 'POST',
        path: '/pay',
        body: { amount: 1 },
        tenantId: 'acme',
        principalId: 'user-1',
      };
      const first = left.execute('same', request, operation);
      await Promise.resolve();
      const second = right.execute('same', request, async () => 'other');
      await Promise.resolve();
      release?.('done');
      await expect(first).resolves.toEqual({
        response: 'done',
        replayed: false,
      });
      await expect(second).resolves.toEqual({
        response: 'done',
        replayed: true,
      });
      expect(operation).toHaveBeenCalledTimes(1);

      await expect(
        left.execute('fail', request, async () => {
          throw new Error('temporary');
        }),
      ).rejects.toThrow('temporary');
      await expect(
        right.execute('fail', request, async () => 'recovered'),
      ).resolves.toMatchObject({ response: 'recovered', replayed: false });
    });

    it('detects cross-instance fingerprint conflicts and validates options', async () => {
      expect(
        () => new IdempotencyService(new InMemoryIdempotencyStore(), 0),
      ).toThrow(RangeError);
      expect(
        () =>
          new IdempotencyService(
            new InMemoryIdempotencyStore(),
            10,
            Date.now,
            () => 'token',
            0,
          ),
      ).toThrow(RangeError);
      expect(() => new InMemoryIdempotencyStore({ maxEntries: 0 })).toThrow(
        RangeError,
      );
      expect(() => new InMemoryIdempotencyStore({ pollIntervalMs: 0 })).toThrow(
        RangeError,
      );

      const store = new InMemoryIdempotencyStore({
        maxEntries: 1,
        pollIntervalMs: 1,
      });
      const service = new IdempotencyService(store);
      await expect(
        service.execute(' ', { method: 'GET', path: '/' }, async () => true),
      ).rejects.toThrow('required');

      let release: (() => void) | undefined;
      const first = service.execute(
        'key',
        { method: 'POST', path: '/a' },
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const conflict = service.execute(
        'key',
        { method: 'POST', path: '/b' },
        async () => undefined,
      );
      await Promise.resolve();
      release?.();
      await first;
      await expect(conflict).rejects.toBeInstanceOf(IdempotencyConflictError);

      await service.execute(
        'bound',
        { method: 'GET', path: '/1' },
        async () => 1,
      );
      expect(store.size()).toBe(1);
      await service.execute(
        'bound-2',
        { method: 'GET', path: '/2' },
        async () => 2,
      );
      expect(store.size()).toBeLessThanOrEqual(1);
    });

    it('waits, times out, and ignores mismatched complete/release', async () => {
      let now = 0;
      const store = new InMemoryIdempotencyStore({
        now: () => now,
        pollIntervalMs: 1,
      });
      await store.tryReserve('k', 'fp', 'owner', 50);
      await store.complete('k', 'other', 'nope', 50);
      await store.release('k', 'other');
      expect(await store.get('k')).toMatchObject({ state: 'in_progress' });
      await store.complete('k', 'owner', 'ok', 50);
      expect(await store.get('k')).toMatchObject({
        state: 'completed',
        response: 'ok',
      });
      now = 100;
      expect(await store.get('k')).toBeUndefined();

      await store.tryReserve('wait', 'fp', 'owner', 1_000);
      await expect(store.waitForCompletion('wait', 5)).resolves.toMatchObject({
        state: 'in_progress',
      });

      const service = new IdempotencyService(
        store,
        1_000,
        () => now,
        () => 'token',
        5,
      );
      const hangKey = service.scopedKey('hang', { method: 'POST', path: '/' });
      const hangFp = service.fingerprint({ method: 'POST', path: '/' });
      await store.tryReserve(hangKey, hangFp, 'other-owner', 1_000);
      await expect(
        service.execute('hang', { method: 'POST', path: '/' }, async () => 'x'),
      ).rejects.toThrow('timed out');
      await store.release(hangKey, 'other-owner');

      const releasedKey = service.scopedKey('gone', {
        method: 'POST',
        path: '/gone',
      });
      const releasedFp = service.fingerprint({
        method: 'POST',
        path: '/gone',
      });
      await store.tryReserve(releasedKey, releasedFp, 'blocker', 1_000);
      const waiter = service.execute(
        'gone',
        { method: 'POST', path: '/gone' },
        async () => 'should-not-run',
      );
      await Promise.resolve();
      await store.release(releasedKey, 'blocker');
      await expect(waiter).rejects.toThrow('released before completion');

      const conflictKey = service.scopedKey('flip', {
        method: 'POST',
        path: '/flip',
      });
      const firstFp = service.fingerprint({
        method: 'POST',
        path: '/flip',
        body: { v: 1 },
      });
      await store.tryReserve(conflictKey, firstFp, 'owner-a', 1_000);
      const conflicting = service.execute(
        'flip',
        { method: 'POST', path: '/flip', body: { v: 1 } },
        async () => 'unused',
      );
      await Promise.resolve();
      await store.release(conflictKey, 'owner-a');
      await store.tryReserve(
        conflictKey,
        service.fingerprint({
          method: 'POST',
          path: '/flip',
          body: { v: 2 },
        }),
        'owner-b',
        1_000,
      );
      await store.complete(conflictKey, 'owner-b', 'other', 1_000);
      await expect(conflicting).rejects.toBeInstanceOf(
        IdempotencyConflictError,
      );

      let clock = 0;
      const bounded = new InMemoryIdempotencyStore({
        maxEntries: 1,
        now: () => clock,
        pollIntervalMs: 1,
      });
      await bounded.tryReserve('old', 'fp', 'o', 10);
      clock = 20;
      await bounded.tryReserve('new', 'fp', 'o', 10);
      expect(bounded.size()).toBe(1);

      await bounded.tryReserve('hold', 'fp', 'o', 1_000);
      const zeroWait = bounded.waitForCompletion('hold', 0);
      await expect(zeroWait).resolves.toMatchObject({ state: 'in_progress' });
      const notified = bounded.waitForCompletion('hold', 50);
      await bounded.complete('hold', 'o', 'done', 1_000);
      await expect(notified).resolves.toMatchObject({
        state: 'completed',
        response: 'done',
      });

      const polling = new InMemoryIdempotencyStore({
        pollIntervalMs: 5,
        now: () => 0,
      });
      await polling.tryReserve('poll', 'fp', 'owner', 1_000);
      const timedOut = polling.waitForCompletion('poll', 12);
      const secondWaiter = polling.waitForCompletion('poll', 12);
      await expect(timedOut).resolves.toMatchObject({ state: 'in_progress' });
      await expect(secondWaiter).resolves.toMatchObject({
        state: 'in_progress',
      });
    });
  });

  describe('health', () => {
    it('reports liveness and dependency outcomes', async () => {
      const up = new DependencyHealthIndicator('database', async () => ({
        pool: 'ok',
      }));
      const falseResult = createDependencyIndicator('cache', () => false);
      const thrown = createDependencyIndicator('broker', () => {
        throw new Error('offline');
      });
      const nonError = createDependencyIndicator('other', () => {
        throw 'failed';
      });
      expect(() => new DependencyHealthIndicator(' ', () => true)).toThrow();
      await expect(up.check()).resolves.toMatchObject({
        name: 'database',
        status: 'up',
        details: { pool: 'ok' },
      });
      await expect(falseResult.check()).resolves.toMatchObject({
        status: 'down',
        message: 'Dependency check returned false',
      });
      await expect(thrown.check()).resolves.toMatchObject({
        status: 'down',
        message: 'offline',
      });
      await expect(nonError.check()).resolves.toMatchObject({
        status: 'down',
        message: 'failed',
      });
      const health = new HealthService(
        [up, falseResult],
        100,
        undefined,
        () => 0,
      );
      expect(health.liveness()).toEqual({
        status: 'up',
        timestamp: '1970-01-01T00:00:00.000Z',
        indicators: [],
      });
      await expect(health.readiness()).resolves.toMatchObject({
        status: 'down',
      });
      await expect(new HealthService([up]).readiness()).resolves.toMatchObject({
        status: 'up',
      });
      await expect(new HealthService().readiness()).resolves.toMatchObject({
        status: 'up',
        indicators: [],
      });
      expect(() => new HealthService([], 0)).toThrow(RangeError);
      expect(() => new HealthService([], Number.NaN)).toThrow(RangeError);
    });

    it('times out hanging checks and converts rejected checks', async () => {
      const callbacks: Array<() => void> = [];
      const timer: HealthTimer = {
        set: (callback): number => callbacks.push(callback) - 1,
        clear: jest.fn(),
      };
      const hanging: HealthIndicator = {
        name: 'hanging',
        check: () => new Promise(() => undefined),
      };
      const rejected: HealthIndicator = {
        name: 'rejected',
        check: async () => Promise.reject('rejected'),
      };
      const rejectedError: HealthIndicator = {
        name: 'rejected-error',
        check: async () => Promise.reject(new Error('error rejection')),
      };
      const health = new HealthService(
        [hanging, rejected, rejectedError],
        5,
        timer,
      );
      const report = health.readiness();
      callbacks[0]?.();
      await expect(report).resolves.toMatchObject({
        status: 'down',
        indicators: [
          {
            name: 'hanging',
            status: 'down',
            message: 'Health check timed out after 5ms',
          },
          { name: 'rejected', status: 'down' },
          {
            name: 'rejected-error',
            status: 'down',
            message: 'error rejection',
          },
        ],
      });
      expect(timer.clear).toHaveBeenCalledTimes(3);
    });
  });

  it('registers a Nest dynamic module with defaults and overrides', () => {
    const defaultModule = ApiModule.register();
    expect(defaultModule.module).toBe(ApiModule);
    expect(defaultModule.exports).toContain(API_SEARCH_PROVIDER);
    const customStore = new InMemoryIdempotencyStore();
    const configured = ApiModule.register({
      versioning: { defaultVersion: '2', supportedVersions: ['2'] },
      idempotencyStore: customStore,
      idempotencyTtlMilliseconds: 20,
      healthIndicators: [],
      healthTimeoutMilliseconds: 20,
      paginationDefaultLimit: 5,
      paginationMaxLimit: 10,
    });
    expect(configured.providers).toHaveLength(
      defaultModule.providers?.length ?? 0,
    );
    const factories = (configured.providers ?? []).filter(
      (
        provider,
      ): provider is {
        readonly provide: unknown;
        readonly useFactory: () => unknown;
      } =>
        typeof provider === 'object' &&
        provider !== null &&
        'useFactory' in provider &&
        typeof provider.useFactory === 'function',
    );
    expect(factories.map((provider) => provider.useFactory())).toHaveLength(4);
    const defaultFactories = (defaultModule.providers ?? []).filter(
      (
        provider,
      ): provider is {
        readonly provide: unknown;
        readonly useFactory: () => unknown;
      } =>
        typeof provider === 'object' &&
        provider !== null &&
        'useFactory' in provider &&
        typeof provider.useFactory === 'function',
    );
    expect(
      defaultFactories.map((provider) => provider.useFactory()),
    ).toHaveLength(4);

    expect(() => ApiModule.register({ isProduction: true })).toThrow(
      'idempotencyStore is required in production',
    );
    expect(() =>
      ApiModule.register({
        isProduction: true,
        idempotencyStore: new InMemoryIdempotencyStore(),
      }),
    ).toThrow('InMemoryIdempotencyStore is not allowed in production');
    expect(() =>
      ApiModule.register({
        isProduction: true,
        allowInMemoryIdempotency: true,
      }),
    ).not.toThrow();

    const externalStore = {
      tryReserve: async () => ({ kind: 'reserved' as const, ownerToken: 'x' }),
      complete: async () => undefined,
      release: async () => undefined,
      get: async () => undefined,
      waitForCompletion: async () => undefined,
    };
    expect(() =>
      ApiModule.register({
        isProduction: true,
        idempotencyStore: externalStore,
      }),
    ).not.toThrow();
  });
});
