import { DynamicModule, Module } from '@nestjs/common';
import {
  allowInMemoryDefaults,
  type ProductionAwareOptions,
} from '../architecture/production-defaults';
import type { RealtimeAuthProvider } from './contracts/realtime-authentication.interface';
import type { RealtimeProvider } from './contracts/realtime-provider.interface';
import type { RealtimeConfig } from './configuration/realtime.config';
import { resolveRealtimeConfig } from './configuration/resolve-realtime-config';
import { createRealtimeAuthProvider } from './authentication/create-auth.provider';
import { createRealtimeProvider } from './providers/create-realtime.provider';
import { PresenceService } from './presence/presence.service';
import { JsonRealtimeSerializer } from './events/json-realtime.serializer';
import { RealtimeGatewayHandler } from './gateways/realtime.gateway';
import { NestSocketIoGateway } from './gateways/nest-socketio.gateway';
import { RealtimeHealthIndicator } from './health/realtime-health.indicator';
import {
  InMemoryRealtimeMetrics,
  type RealtimeMetrics,
} from './observability/realtime-metrics';
import { RealtimeService } from './realtime.service';
import {
  REALTIME_AUTH_PROVIDER,
  REALTIME_CONFIG,
  REALTIME_METRICS,
  REALTIME_PRESENCE,
  REALTIME_PROVIDER,
  REALTIME_SERIALIZER,
} from './realtime.tokens';

export interface RealtimeModuleOptions extends ProductionAwareOptions {
  readonly config?: RealtimeConfig;
  /** Process-env style map used when `config` is omitted. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly provider?: RealtimeProvider;
  readonly authProvider?: RealtimeAuthProvider;
  readonly metrics?: RealtimeMetrics;
  readonly presence?: PresenceService | false;
}

@Module({})
export class RealtimeModule {
  public static register(options: RealtimeModuleOptions = {}): DynamicModule {
    allowInMemoryDefaults(options);
    const env = options.env ?? process.env;
    const config = options.config ?? resolveRealtimeConfig(env);
    const serializer = new JsonRealtimeSerializer();
    const provider =
      options.provider ?? createRealtimeProvider(config, serializer);
    const auth = options.authProvider ?? createRealtimeAuthProvider(config);
    const presence =
      options.presence === false
        ? undefined
        : (options.presence ??
          (config.presenceEnabled ? new PresenceService() : undefined));
    const metrics = options.metrics ?? new InMemoryRealtimeMetrics();
    const service = new RealtimeService(provider, config, presence, metrics);
    const gateway = new RealtimeGatewayHandler(
      provider,
      auth,
      config,
      presence,
      metrics,
    );
    const health = new RealtimeHealthIndicator(provider, config, metrics);
    const nestGatewayEnabled =
      config.enabled &&
      (config.provider === 'socketio' || config.provider === 'nest-ws');

    return {
      module: RealtimeModule,
      providers: [
        { provide: REALTIME_CONFIG, useValue: config },
        { provide: REALTIME_PROVIDER, useValue: provider },
        { provide: REALTIME_AUTH_PROVIDER, useValue: auth },
        { provide: REALTIME_PRESENCE, useValue: presence },
        { provide: REALTIME_SERIALIZER, useValue: serializer },
        { provide: REALTIME_METRICS, useValue: metrics },
        { provide: RealtimeService, useValue: service },
        { provide: RealtimeGatewayHandler, useValue: gateway },
        { provide: RealtimeHealthIndicator, useValue: health },
        ...(nestGatewayEnabled ? [NestSocketIoGateway] : []),
      ],
      exports: [
        REALTIME_CONFIG,
        REALTIME_PROVIDER,
        REALTIME_AUTH_PROVIDER,
        REALTIME_PRESENCE,
        REALTIME_SERIALIZER,
        REALTIME_METRICS,
        RealtimeService,
        RealtimeGatewayHandler,
        RealtimeHealthIndicator,
        ...(nestGatewayEnabled ? [NestSocketIoGateway] : []),
      ],
    };
  }
}
