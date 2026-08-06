import { Injectable } from '@nestjs/common';
import { assertPositiveInteger } from '../../architecture/production-defaults';
import {
  Plugin,
  PluginContext,
  PluginFailure,
  PluginState,
} from './plugin.interface';

type Transition = Exclude<PluginState, 'registered'>;
type LifecycleMethod = 'install' | 'initialize' | 'start' | 'stop';

const PREVIOUS_STATE: Readonly<Record<Transition, PluginState>> = {
  installed: 'registered',
  initialized: 'installed',
  started: 'initialized',
  stopped: 'started',
};

const LIFECYCLE_METHOD: Readonly<Record<Transition, LifecycleMethod>> = {
  installed: 'install',
  initialized: 'initialize',
  started: 'start',
  stopped: 'stop',
};

export interface PluginManagerOptions {
  /** Maximum retained plugin failures. Defaults to 1_000. */
  readonly maxFailures?: number;
}

@Injectable()
export class PluginManager {
  private readonly plugins = new Map<string, Plugin>();
  private readonly states = new Map<string, PluginState>();
  private readonly failures: PluginFailure[] = [];
  private readonly maxFailures: number;
  private lifecycleQueue: Promise<void> = Promise.resolve();

  public constructor(options: PluginManagerOptions = {}) {
    this.maxFailures = assertPositiveInteger(
      options.maxFailures ?? 1_000,
      'PluginManager maxFailures',
    );
  }

  public register(plugin: Plugin): void {
    if (plugin.name.trim().length === 0 || plugin.version.trim().length === 0) {
      throw new TypeError('Plugin name and version must be non-empty');
    }
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
    this.states.set(plugin.name, 'registered');
  }

  public getState(name: string): PluginState | undefined {
    return this.states.get(name);
  }

  public getFailures(): readonly PluginFailure[] {
    return this.failures.map((failure) =>
      Object.freeze({ ...failure, timestamp: new Date(failure.timestamp) }),
    );
  }

  public resolveDependencyOrder(): readonly Plugin[] {
    const ordered: Plugin[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (plugin: Plugin): void => {
      if (visiting.has(plugin.name)) {
        throw new Error(
          `Circular plugin dependency involving "${plugin.name}"`,
        );
      }
      if (visited.has(plugin.name)) {
        return;
      }
      visiting.add(plugin.name);
      for (const dependencyName of plugin.dependencies ?? []) {
        const dependency = this.plugins.get(dependencyName);
        if (!dependency) {
          throw new Error(
            `Plugin "${plugin.name}" requires missing plugin "${dependencyName}"`,
          );
        }
        visit(dependency);
      }
      visiting.delete(plugin.name);
      visited.add(plugin.name);
      ordered.push(plugin);
    };

    for (const plugin of this.plugins.values()) {
      visit(plugin);
    }
    return Object.freeze(ordered);
  }

  public install(context: PluginContext): Promise<void> {
    return this.enqueue('installed', context);
  }

  public initialize(context: PluginContext): Promise<void> {
    return this.enqueue('initialized', context);
  }

  public start(context: PluginContext): Promise<void> {
    return this.enqueue('started', context);
  }

  public stop(context: PluginContext): Promise<void> {
    return this.enqueue('stopped', context);
  }

  private enqueue(
    transition: Transition,
    context: PluginContext,
  ): Promise<void> {
    const operation = this.lifecycleQueue.then(() =>
      this.runTransition(transition, context),
    );
    this.lifecycleQueue = operation.catch(() => undefined);
    return operation;
  }

  private async runTransition(
    transition: Transition,
    context: PluginContext,
  ): Promise<void> {
    const ordered = [...this.resolveDependencyOrder()];
    if (transition === 'stopped') {
      ordered.reverse();
    }
    for (const plugin of ordered) {
      if (this.states.get(plugin.name) !== PREVIOUS_STATE[transition]) {
        continue;
      }
      try {
        await plugin[LIFECYCLE_METHOD[transition]](context);
        this.states.set(plugin.name, transition);
      } catch (reason: unknown) {
        if (this.failures.length >= this.maxFailures) {
          this.failures.shift();
        }
        this.failures.push({
          plugin: plugin.name,
          transition,
          error: reason instanceof Error ? reason : new Error(String(reason)),
          timestamp: new Date(),
        });
      }
    }
  }
}
