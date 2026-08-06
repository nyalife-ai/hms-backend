import type { ExecutionContext } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryQuotaStore } from '../in-memory-quota.store';
import { MeteringService } from '../metering.service';
import { QuotaGuard, type QuotaRequestLike } from '../quota.guard';
import type { QuotaStore } from '../quota-store.interface';
import { QuotaExceededError, QuotaService } from '../quota.service';
import { METERING_SERVICE, QUOTA_SERVICE, QUOTA_STORE } from '../quotas.tokens';

describe('quotas platform / in-memory-quota.store', () => {
  it('returns undefined limit and zero usage by default', async () => {
    const store = new InMemoryQuotaStore();
    expect(await store.getLimit('tenant-a', 'storage')).toBeUndefined();
    expect(await store.getUsage('tenant-a', 'storage')).toBe(0);
  });

  it('sets and retrieves a limit', async () => {
    const store = new InMemoryQuotaStore();
    await store.setLimit('tenant-a', 'storage', 10 * 1024);
    expect(await store.getLimit('tenant-a', 'storage')).toBe(10 * 1024);
  });

  it('increments and decrements usage, floored at zero', async () => {
    const store = new InMemoryQuotaStore();
    expect(await store.increment('tenant-a', 'api_calls', 5)).toBe(5);
    expect(await store.increment('tenant-a', 'api_calls', 3)).toBe(8);
    expect(await store.decrement('tenant-a', 'api_calls', 2)).toBe(6);
    expect(await store.decrement('tenant-a', 'api_calls', 100)).toBe(0);
  });

  it('decrements from zero when there is no prior usage, floored at zero', async () => {
    const store = new InMemoryQuotaStore();
    expect(await store.decrement('tenant-a', 'bandwidth', 5)).toBe(0);
  });

  it('resets usage back to zero and isolates tenants/resources', async () => {
    const store = new InMemoryQuotaStore();
    await store.increment('tenant-a', 'bandwidth', 10);
    await store.increment('tenant-b', 'bandwidth', 20);
    await store.reset('tenant-a', 'bandwidth');
    expect(await store.getUsage('tenant-a', 'bandwidth')).toBe(0);
    expect(await store.getUsage('tenant-b', 'bandwidth')).toBe(20);
  });
});

describe('quotas platform / quota.service', () => {
  function makeService(defaultLimit?: number): {
    service: QuotaService;
    store: QuotaStore;
  } {
    const store = new InMemoryQuotaStore();
    return { service: new QuotaService({ store, defaultLimit }), store };
  }

  it('rejects a negative or non-finite limit', async () => {
    const { service } = makeService();
    await expect(service.setLimit('t1', 'storage', -1)).rejects.toThrow(
      RangeError,
    );
    await expect(
      service.setLimit('t1', 'storage', Number.POSITIVE_INFINITY),
    ).rejects.toThrow(RangeError);
  });

  it('reports unlimited usage when no limit and no default is configured', async () => {
    const { service } = makeService();
    const usage = await service.getUsage('t1', 'storage');
    expect(usage).toEqual({
      tenantId: 't1',
      resource: 'storage',
      used: 0,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
    });
  });

  it('falls back to the configured default limit', async () => {
    const { service } = makeService(100);
    const usage = await service.getUsage('t1', 'api_calls');
    expect(usage.limit).toBe(100);
    expect(usage.remaining).toBe(100);
  });

  it('supports independent tenant limits (10GB vs 1TB storage)', async () => {
    const { service } = makeService();
    const tenGb = 10 * 1024 * 1024 * 1024;
    const oneTb = 1024 * 1024 * 1024 * 1024;
    await service.setLimit('tenant-a', 'storage', tenGb);
    await service.setLimit('tenant-b', 'storage', oneTb);
    expect((await service.getUsage('tenant-a', 'storage')).limit).toBe(tenGb);
    expect((await service.getUsage('tenant-b', 'storage')).limit).toBe(oneTb);
  });

  it('checks availability without mutating usage', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'api_calls', 5);
    const allowed = await service.check('t1', 'api_calls', 3);
    expect(allowed.allowed).toBe(true);
    expect(allowed.used).toBe(0);

    const denied = await service.check('t1', 'api_calls', 6);
    expect(denied.allowed).toBe(false);

    expect((await service.getUsage('t1', 'api_calls')).used).toBe(0);
  });

  it('uses a default amount of 1 for check', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'api_calls', 1);
    expect((await service.check('t1', 'api_calls')).allowed).toBe(true);
  });

  it('consumes quota atomically and reports remaining', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'processing_time', 100);
    const result = await service.consume('t1', 'processing_time', 40);
    expect(result).toEqual({
      tenantId: 't1',
      resource: 'processing_time',
      used: 40,
      limit: 100,
      remaining: 60,
      allowed: true,
    });
    const second = await service.consume('t1', 'processing_time', 60);
    expect(second.used).toBe(100);
    expect(second.remaining).toBe(0);
  });

  it('uses a default amount of 1 for consume', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'api_calls', 1);
    const result = await service.consume('t1', 'api_calls');
    expect(result.used).toBe(1);
  });

  it('throws QuotaExceededError instead of over-consuming', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'bandwidth', 10);
    await expect(service.consume('t1', 'bandwidth', 11)).rejects.toThrow(
      QuotaExceededError,
    );
    expect((await service.getUsage('t1', 'bandwidth')).used).toBe(0);
  });

  it('rejects a non-positive or non-finite consume amount', async () => {
    const { service } = makeService();
    await expect(service.consume('t1', 'storage', 0)).rejects.toThrow(
      RangeError,
    );
    await expect(service.consume('t1', 'storage', -5)).rejects.toThrow(
      RangeError,
    );
    await expect(service.consume('t1', 'storage', Number.NaN)).rejects.toThrow(
      RangeError,
    );
  });

  it('releases previously consumed usage', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'storage', 100);
    await service.consume('t1', 'storage', 50);
    const released = await service.release('t1', 'storage', 20);
    expect(released.used).toBe(30);
    expect(released.remaining).toBe(70);
  });

  it('uses a default amount of 1 for release', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'storage', 10);
    await service.consume('t1', 'storage', 5);
    const released = await service.release('t1', 'storage');
    expect(released.used).toBe(4);
  });

  it('rejects a non-positive or non-finite release amount', async () => {
    const { service } = makeService();
    await expect(service.release('t1', 'storage', 0)).rejects.toThrow(
      RangeError,
    );
    await expect(service.release('t1', 'storage', -1)).rejects.toThrow(
      RangeError,
    );
  });

  it('resets usage via the store', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'storage', 100);
    await service.consume('t1', 'storage', 50);
    await service.reset('t1', 'storage');
    expect((await service.getUsage('t1', 'storage')).used).toBe(0);
  });

  it('names the QuotaExceededError and carries structured fields', async () => {
    const { service } = makeService();
    await service.setLimit('t1', 'storage', 5);
    try {
      await service.consume('t1', 'storage', 6);
      throw new Error('expected consume to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(QuotaExceededError);
      const quotaError = error as QuotaExceededError;
      expect(quotaError.name).toBe('QuotaExceededError');
      expect(quotaError.tenantId).toBe('t1');
      expect(quotaError.resource).toBe('storage');
      expect(quotaError.limit).toBe(5);
      expect(quotaError.attempted).toBe(6);
      expect(quotaError.message).toContain('Quota exceeded');
    }
  });
});

describe('quotas platform / metering.service', () => {
  it('rejects non-positive or non-finite amounts', async () => {
    const metering = new MeteringService();
    await expect(metering.record('t1', 'bandwidth', 0)).rejects.toThrow(
      RangeError,
    );
    await expect(metering.record('t1', 'bandwidth', -1)).rejects.toThrow(
      RangeError,
    );
  });

  it('records events with a default clock and no metadata', async () => {
    const metering = new MeteringService();
    const before = Date.now();
    const event = await metering.record('t1', 'bandwidth', 5);
    expect(event.tenantId).toBe('t1');
    expect(event.resource).toBe('bandwidth');
    expect(event.amount).toBe(5);
    expect(event.metadata).toBeUndefined();
    expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('records events with an injected clock and metadata', async () => {
    const fixed = new Date('2026-02-01T00:00:00Z');
    const metering = new MeteringService({ clock: () => fixed });
    const event = await metering.record('t1', 'storage', 2, { fileId: 'f1' });
    expect(event.timestamp).toEqual(fixed);
    expect(event.metadata).toEqual({ fileId: 'f1' });
  });

  it('queries events by tenant, resource, and since', async () => {
    const metering = new MeteringService({
      clock: () => new Date('2026-01-01T00:00:00Z'),
    });
    await metering.record('t1', 'storage', 1);
    await metering.record('t1', 'api_calls', 2);
    await metering.record('t2', 'storage', 3);

    expect(metering.query({ tenantId: 't1' })).toHaveLength(2);
    expect(
      metering.query({ tenantId: 't1', resource: 'storage' }),
    ).toHaveLength(1);
    expect(
      metering.query({
        tenantId: 't1',
        since: new Date('2026-06-01T00:00:00Z'),
      }),
    ).toHaveLength(0);
  });

  it('sums total usage for a query', async () => {
    const metering = new MeteringService();
    await metering.record('t1', 'api_calls', 3);
    await metering.record('t1', 'api_calls', 4);
    await metering.record('t1', 'storage', 100);
    expect(metering.total({ tenantId: 't1', resource: 'api_calls' })).toBe(7);
  });

  it('evicts the oldest event once maxEvents is reached', async () => {
    const metering = new MeteringService({ maxEvents: 2 });
    await metering.record('t1', 'api_calls', 1, { seq: 1 });
    await metering.record('t1', 'api_calls', 1, { seq: 2 });
    await metering.record('t1', 'api_calls', 1, { seq: 3 });
    const events = metering.query({ tenantId: 't1' });
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.metadata?.['seq'])).toEqual([2, 3]);
  });

  it('forwards consumption to an injected QuotaService', async () => {
    const store = new InMemoryQuotaStore();
    const quotaService = new QuotaService({ store, defaultLimit: 100 });
    const metering = new MeteringService({ quotaService });
    await metering.record('t1', 'api_calls', 10);
    expect((await quotaService.getUsage('t1', 'api_calls')).used).toBe(10);
  });

  it('propagates QuotaExceededError from the injected QuotaService', async () => {
    const store = new InMemoryQuotaStore();
    const quotaService = new QuotaService({ store, defaultLimit: 5 });
    const metering = new MeteringService({ quotaService });
    await expect(metering.record('t1', 'api_calls', 10)).rejects.toThrow(
      QuotaExceededError,
    );
  });
});

describe('quotas platform / quota.guard', () => {
  function makeContext(request: QuotaRequestLike): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows the request and consumes quota when the tenant is resolved from tenantId', async () => {
    const store = new InMemoryQuotaStore();
    const quotaService = new QuotaService({ store, defaultLimit: 10 });
    const guard = new QuotaGuard(quotaService, { resource: 'api_calls' });
    const allowed = await guard.canActivate(makeContext({ tenantId: 't1' }));
    expect(allowed).toBe(true);
    expect((await quotaService.getUsage('t1', 'api_calls')).used).toBe(1);
  });

  it('resolves the tenant from request.tenant.id when tenantId is absent', async () => {
    const store = new InMemoryQuotaStore();
    const quotaService = new QuotaService({ store, defaultLimit: 10 });
    const guard = new QuotaGuard(quotaService, { resource: 'api_calls' });
    const allowed = await guard.canActivate(
      makeContext({ tenant: { id: 't2' } }),
    );
    expect(allowed).toBe(true);
    expect((await quotaService.getUsage('t2', 'api_calls')).used).toBe(1);
  });

  it('uses a custom tenantIdExtractor over the default resolution', async () => {
    const store = new InMemoryQuotaStore();
    const quotaService = new QuotaService({ store, defaultLimit: 10 });
    const guard = new QuotaGuard(quotaService, {
      resource: 'api_calls',
      tenantIdExtractor: () => 'custom-tenant',
    });
    await guard.canActivate(makeContext({ tenantId: 'ignored' }));
    expect(
      (await quotaService.getUsage('custom-tenant', 'api_calls')).used,
    ).toBe(1);
  });

  it('consumes a custom amount when configured', async () => {
    const store = new InMemoryQuotaStore();
    const quotaService = new QuotaService({ store, defaultLimit: 10 });
    const guard = new QuotaGuard(quotaService, {
      resource: 'bandwidth',
      amount: 4,
    });
    await guard.canActivate(makeContext({ tenantId: 't1' }));
    expect((await quotaService.getUsage('t1', 'bandwidth')).used).toBe(4);
  });

  it('rejects with 400 when no tenant can be resolved', async () => {
    const store = new InMemoryQuotaStore();
    const quotaService = new QuotaService({ store });
    const guard = new QuotaGuard(quotaService, { resource: 'api_calls' });
    await expect(guard.canActivate(makeContext({}))).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects with 429 when the quota is exceeded', async () => {
    const store = new InMemoryQuotaStore();
    const quotaService = new QuotaService({ store, defaultLimit: 1 });
    const guard = new QuotaGuard(quotaService, { resource: 'api_calls' });
    await guard.canActivate(makeContext({ tenantId: 't1' }));
    await expect(
      guard.canActivate(makeContext({ tenantId: 't1' })),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('rethrows unexpected errors from the quota service unchanged', async () => {
    const quotaService = new QuotaService({
      store: {
        getLimit: () => Promise.resolve(undefined),
        setLimit: () => Promise.resolve(),
        getUsage: () => Promise.reject(new Error('store unavailable')),
        increment: () => Promise.resolve(0),
        decrement: () => Promise.resolve(0),
        reset: () => Promise.resolve(),
      },
    });
    const guard = new QuotaGuard(quotaService, { resource: 'api_calls' });
    await expect(
      guard.canActivate(makeContext({ tenantId: 't1' })),
    ).rejects.toThrow('store unavailable');
  });

  it('is not itself an HttpException when rethrowing unexpected errors', async () => {
    const quotaService = new QuotaService({
      store: {
        getLimit: () => Promise.resolve(undefined),
        setLimit: () => Promise.resolve(),
        getUsage: () => Promise.reject(new Error('boom')),
        increment: () => Promise.resolve(0),
        decrement: () => Promise.resolve(0),
        reset: () => Promise.resolve(),
      },
    });
    const guard = new QuotaGuard(quotaService, { resource: 'storage' });
    try {
      await guard.canActivate(makeContext({ tenantId: 't1' }));
      throw new Error('expected canActivate to throw');
    } catch (error) {
      expect(error).not.toBeInstanceOf(HttpException);
    }
  });
});

describe('quotas platform / quotas.tokens', () => {
  it('exposes distinct DI tokens', () => {
    expect(typeof QUOTA_STORE).toBe('symbol');
    expect(typeof QUOTA_SERVICE).toBe('symbol');
    expect(typeof METERING_SERVICE).toBe('symbol');
  });
});
