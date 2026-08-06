import { DynamicModule, Module } from '@nestjs/common';
import {
  allowInMemoryDefaults,
  type ProductionAwareOptions,
} from '../architecture/production-defaults';
import { ModuleDiscovery } from './discovery/module-discovery';
import { FeatureFlagService } from './feature-flags/feature-flag.service';
import {
  FEATURE_FLAG_STORE,
  FeatureFlagStore,
} from './feature-flags/feature-flag-store.interface';
import { FlagRule } from './feature-flags/feature-flag.types';
import { InMemoryFeatureFlagStore } from './feature-flags/in-memory-feature-flag.store';
import { PluginManager } from './plugins/plugin-manager';

export interface ExtensibilityModuleOptions extends ProductionAwareOptions {
  readonly flags?: Readonly<Record<string, FlagRule>>;
  /**
   * Feature-flag store. Required in production unless `allowInMemory`.
   */
  readonly flagStore?: FeatureFlagStore;
  readonly flagMaxEntries?: number;
  readonly pluginMaxFailures?: number;
}

@Module({})
export class ExtensibilityModule {
  public static register(
    options: ExtensibilityModuleOptions = {},
  ): DynamicModule {
    const allowInMemory = allowInMemoryDefaults(options);
    const store =
      options.flagStore ??
      (allowInMemory
        ? new InMemoryFeatureFlagStore(options.flags, {
            maxEntries: options.flagMaxEntries,
          })
        : undefined);
    if (!store) {
      throw new Error(
        'ExtensibilityModule: flagStore is required in production (or set allowInMemory: true)',
      );
    }
    const pluginManager = new PluginManager({
      maxFailures: options.pluginMaxFailures,
    });
    return {
      module: ExtensibilityModule,
      providers: [
        { provide: PluginManager, useValue: pluginManager },
        ModuleDiscovery,
        { provide: FEATURE_FLAG_STORE, useValue: store },
        {
          provide: FeatureFlagService,
          useFactory: (flagStore: FeatureFlagStore): FeatureFlagService =>
            new FeatureFlagService(flagStore),
          inject: [FEATURE_FLAG_STORE],
        },
      ],
      exports: [
        PluginManager,
        ModuleDiscovery,
        FEATURE_FLAG_STORE,
        FeatureFlagService,
      ],
    };
  }
}
