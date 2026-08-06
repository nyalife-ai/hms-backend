import type {
  HealthIndicatorResult,
  HealthStatus,
} from '../../api/health/health.types';
import type { RealtimeProvider } from '../contracts/realtime-provider.interface';
import type { RealtimeConfig } from '../configuration/realtime.config';
import type { RealtimeMetrics } from '../observability/realtime-metrics';

export class RealtimeHealthIndicator {
  public constructor(
    private readonly provider: RealtimeProvider,
    private readonly config: RealtimeConfig,
    private readonly metrics?: RealtimeMetrics,
  ) {}

  public check(): HealthIndicatorResult {
    const started = Date.now();
    const connections = this.provider.connectionCount();
    const rooms = this.provider.roomCount();
    const memory = process.memoryUsage();
    // In-process providers are always reachable; cloud stubs still report up
    // so Nest Terminus does not fail the process when realtime is optional.
    const status: HealthStatus = 'up';
    return {
      name: 'realtime',
      status,
      message: this.config.enabled
        ? `provider=${String(this.provider.name)} connections=${connections}`
        : 'realtime disabled (noop)',
      durationMs: Date.now() - started,
      details: {
        enabled: this.config.enabled,
        provider: String(this.provider.name),
        transport: this.config.transport,
        connected: connections > 0,
        disconnected: connections === 0,
        activeConnections: connections,
        rooms,
        memoryUsage: {
          rss: memory.rss,
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
        },
        metrics: this.metrics?.snapshot(),
      },
    };
  }
}
