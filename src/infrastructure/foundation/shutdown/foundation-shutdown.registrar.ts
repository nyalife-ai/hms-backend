import type { GracefulShutdownService } from '../../../platform/reliability/shutdown/graceful-shutdown.service';
import type { RedisClientService } from '../../redis/redis-client.service';
import type { FoundationModuleOptions } from '../foundation.options';

export const FOUNDATION_SHUTDOWN_TARGETS = Symbol(
  'FOUNDATION_SHUTDOWN_TARGETS',
);

export type Disconnectable = {
  disconnect(): Promise<void> | void;
};

export type FoundationShutdownTargets = Readonly<{
  readonly database?: Disconnectable;
  readonly redis?: RedisClientService;
  readonly broker?: Disconnectable;
}>;

/**
 * Registers Nest lifecycle shutdown hooks: resource cleanup for DB / Redis /
 * broker after active-request drain (handled by GracefulShutdownService).
 *
 * Constructed via FoundationModule factory providers when reliability is enabled.
 */
export class FoundationShutdownRegistrar {
  public constructor(
    private readonly options: FoundationModuleOptions,
    private readonly shutdown: GracefulShutdownService,
    private readonly targets: FoundationShutdownTargets,
  ) {}

  public onModuleInit(): void {
    const hooks = this.options.shutdown;
    const registerResources =
      hooks === undefined || hooks.registerResourceHooks !== false;

    if (registerResources) {
      const database = this.targets.database;
      if (database !== undefined && typeof database.disconnect === 'function') {
        this.shutdown.register(
          'foundation.database',
          () => database.disconnect(),
          100,
        );
      }
      const redis = this.targets.redis;
      if (redis !== undefined) {
        this.shutdown.register(
          'foundation.redis',
          () => redis.disconnect(),
          110,
        );
      }
      const broker = this.targets.broker;
      if (broker !== undefined && typeof broker.disconnect === 'function') {
        this.shutdown.register(
          'foundation.broker',
          () => broker.disconnect(),
          120,
        );
      }
    }

    const customHooks = hooks === undefined ? [] : (hooks.hooks ?? []);
    for (const hook of customHooks) {
      const order = hook.order === undefined ? 200 : hook.order;
      this.shutdown.register(hook.name, hook.hook, order);
    }
  }
}
