import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import * as extensibilityExports from '../index';
import { ModuleDiscovery } from '../discovery/module-discovery';
import { FeatureFlagService } from '../feature-flags/feature-flag.service';
import {
  FEATURE_FLAG_STORE,
  FeatureFlagStore,
} from '../feature-flags/feature-flag-store.interface';
import { InMemoryFeatureFlagStore } from '../feature-flags/in-memory-feature-flag.store';
import { ExtensibilityModule } from '../extensibility.module';
import { Plugin, PluginContext } from '../plugins/plugin.interface';
import { PluginManager } from '../plugins/plugin-manager';

const context: PluginContext = {
  services: new Map(),
  metadata: Object.freeze({}),
};

function plugin(
  name: string,
  calls: string[],
  dependencies?: readonly string[],
  failure?: string,
): Plugin {
  const run = async (phase: string): Promise<void> => {
    calls.push(`${phase}:${name}`);
    if (failure === phase) {
      throw name === 'string-error' ? 'failed' : new Error('failed');
    }
  };
  return {
    name,
    version: '1.0.0',
    dependencies,
    install: async (): Promise<void> => run('install'),
    initialize: async (): Promise<void> => run('initialize'),
    start: async (): Promise<void> => run('start'),
    stop: async (): Promise<void> => run('stop'),
  };
}

describe('extensibility platform', () => {
  it('orders plugins, runs idempotent transitions, and reverses stop order', async () => {
    const calls: string[] = [];
    const manager = new PluginManager();
    manager.register(plugin('dependent', calls, ['base']));
    manager.register(plugin('base', calls));
    expect(manager.resolveDependencyOrder().map(({ name }) => name)).toEqual([
      'base',
      'dependent',
    ]);
    await Promise.all([manager.install(context), manager.install(context)]);
    await manager.initialize(context);
    await manager.start(context);
    await manager.stop(context);
    await manager.stop(context);
    expect(calls).toEqual([
      'install:base',
      'install:dependent',
      'initialize:base',
      'initialize:dependent',
      'start:base',
      'start:dependent',
      'stop:dependent',
      'stop:base',
    ]);
    expect(manager.getState('base')).toBe('stopped');
    expect(manager.getState('missing')).toBeUndefined();
  });

  it('isolates failures, records defensive failure data, and recovers', async () => {
    const calls: string[] = [];
    const manager = new PluginManager();
    manager.register(plugin('bad', calls, undefined, 'install'));
    manager.register(plugin('good', calls));
    await manager.install(context);
    expect(manager.getState('bad')).toBe('registered');
    expect(manager.getState('good')).toBe('installed');
    expect(manager.getFailures()[0].error.message).toBe('failed');
    expect(manager.getFailures()[0].timestamp).not.toBe(
      manager.getFailures()[0].timestamp,
    );
    manager.register(plugin('string-error', calls, undefined, 'install'));
    await manager.install(context);
    expect(manager.getFailures()[1].error).toEqual(new Error('failed'));

    const bounded = new PluginManager({ maxFailures: 1 });
    bounded.register(plugin('first', calls, undefined, 'install'));
    await bounded.install(context);
    bounded.register(plugin('second', calls, undefined, 'install'));
    await bounded.install(context);
    expect(bounded.getFailures()).toHaveLength(1);
    expect(bounded.getFailures()[0].plugin).toBe('second');
  });

  it('rejects invalid, duplicate, missing, and cyclic plugins', () => {
    const manager = new PluginManager();
    expect(() => manager.register(plugin('', []))).toThrow(TypeError);
    expect(() => manager.register(plugin('name', [], undefined))).not.toThrow();
    expect(() => manager.register(plugin('name', []))).toThrow(
      'already registered',
    );
    const missing = new PluginManager();
    missing.register(plugin('one', [], ['absent']));
    expect(() => missing.resolveDependencyOrder()).toThrow('missing plugin');
    const cyclic = new PluginManager();
    cyclic.register(plugin('one', [], ['two']));
    cyclic.register(plugin('two', [], ['one']));
    expect(() => cyclic.resolveDependencyOrder()).toThrow('Circular');
    const badVersion = plugin('version', []);
    expect(() => manager.register({ ...badVersion, version: ' ' })).toThrow(
      TypeError,
    );
  });

  it('recovers its lifecycle queue after dependency resolution fails', async () => {
    const manager = new PluginManager();
    manager.register(plugin('dependent', [], ['base']));
    await expect(manager.install(context)).rejects.toThrow('missing plugin');
    manager.register(plugin('base', []));
    await expect(manager.install(context)).resolves.toBeUndefined();
  });

  it('discovers modules and providers by convention with deduplication', () => {
    class AlphaModule {}
    class AlphaProvider {}
    const discovery = new ModuleDiscovery();
    discovery.register([
      { kind: 'module', target: AlphaModule },
      { kind: 'module', target: AlphaModule },
      { kind: 'provider', target: AlphaProvider },
    ]);
    expect(discovery.getModules()).toEqual([AlphaModule]);
    expect(discovery.getProviders()).toEqual([AlphaProvider]);
    expect(discovery.isRegistered('AlphaModule')).toBe(true);
    expect(discovery.isRegistered('AlphaModule', 'module')).toBe(true);
    expect(discovery.isRegistered('AlphaModule', 'provider')).toBe(false);
    expect(discovery.isRegistered('none')).toBe(false);
    expect(() =>
      discovery.register([
        { kind: 'invalid' as 'module', target: AlphaModule },
      ]),
    ).toThrow(TypeError);
    expect(() =>
      discovery.register([
        { kind: 'module', target: undefined as unknown as typeof AlphaModule },
      ]),
    ).toThrow(TypeError);
  });

  it('evaluates targeting, environments, and deterministic percentages', () => {
    const store = new InMemoryFeatureFlagStore({
      disabled: { enabled: false },
      all: { enabled: true },
      targeted: {
        enabled: true,
        users: ['user'],
        tenants: ['tenant'],
        environments: ['production'],
      },
      none: { enabled: true, percentage: 0 },
      full: { enabled: true, percentage: 100 },
      rollout: { enabled: true, percentage: 50 },
    });
    const service = new FeatureFlagService(store);
    expect(service.isEnabled('unknown')).toBe(false);
    expect(service.isEnabled('disabled')).toBe(false);
    expect(service.isEnabled('all')).toBe(true);
    expect(service.isEnabled('targeted')).toBe(false);
    expect(service.isEnabled('targeted', { userId: 'other' })).toBe(false);
    expect(
      service.isEnabled('targeted', { userId: 'user', tenantId: 'other' }),
    ).toBe(false);
    expect(
      service.isEnabled('targeted', {
        userId: 'user',
        tenantId: 'tenant',
        environment: 'staging',
      }),
    ).toBe(false);
    expect(
      service.isEnabled('targeted', {
        userId: 'user',
        tenantId: 'tenant',
        environment: 'production',
      }),
    ).toBe(true);
    expect(service.isEnabled('none', { userId: 'user' })).toBe(false);
    expect(service.isEnabled('full')).toBe(true);
    expect(service.isEnabled('rollout')).toBe(false);
    expect(service.isEnabled('rollout', { userId: 'stable' })).toBe(
      service.isEnabled('rollout', { userId: 'stable' }),
    );
  });

  it('validates and snapshots the in-memory flag store', () => {
    const store = new InMemoryFeatureFlagStore();
    expect(() => store.set(' ', { enabled: true })).toThrow(TypeError);
    for (const percentage of [-1, 101, Number.NaN]) {
      expect(() => store.set('bad', { enabled: true, percentage })).toThrow(
        RangeError,
      );
    }
    store.set('flag', {
      enabled: true,
      users: ['u'],
      tenants: ['t'],
      environments: ['e'],
    });
    expect(store.entries().get('flag')).toEqual(store.get('flag'));
    expect(store.delete('flag')).toBe(true);
    expect(store.delete('flag')).toBe(false);
  });

  it('wires default and custom stores and exports the barrel', async () => {
    expect(extensibilityExports.PluginManager).toBe(PluginManager);
    const defaults = await Test.createTestingModule({
      imports: [
        ExtensibilityModule.register({ flags: { x: { enabled: true } } }),
      ],
    }).compile();
    expect(defaults.get(FeatureFlagService).isEnabled('x')).toBe(true);
    await defaults.close();

    const store: FeatureFlagStore = new InMemoryFeatureFlagStore();
    const custom = await Test.createTestingModule({
      imports: [ExtensibilityModule.register({ flagStore: store })],
    }).compile();
    expect(custom.get(FEATURE_FLAG_STORE)).toBe(store);
    await custom.close();

    const empty = await Test.createTestingModule({
      imports: [ExtensibilityModule.register()],
    }).compile();
    expect(empty.get(FeatureFlagService).isEnabled('none')).toBe(false);
    await empty.close();

    expect(() => ExtensibilityModule.register({ isProduction: true })).toThrow(
      /flagStore is required/,
    );
    expect(() =>
      ExtensibilityModule.register({
        isProduction: true,
        allowInMemory: true,
      }),
    ).not.toThrow();

    const bounded = new InMemoryFeatureFlagStore({}, { maxEntries: 1 });
    bounded.set('one', { enabled: true });
    expect(() => bounded.set('two', { enabled: false })).toThrow(/full/);
    bounded.set('one', { enabled: false });
    expect(bounded.get('one')?.enabled).toBe(false);
  });
});
