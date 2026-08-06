import type { QuotaService } from './quota.service';
import type { MeteringEvent, QuotaResource } from './quota.types';

export interface MeteringServiceOptions {
  /** When supplied, `record` also consumes the recorded amount from this service. */
  readonly quotaService?: QuotaService;
  readonly clock?: () => Date;
  /** Maximum retained events; oldest events are evicted first. Defaults to 10_000. */
  readonly maxEvents?: number;
}

export interface MeteringQuery {
  readonly tenantId: string;
  readonly resource?: QuotaResource;
  readonly since?: Date;
}

/**
 * Records raw tenant usage events (for billing/analytics/audit) independent
 * of the running counters in {@link QuotaService}. Optionally forwards
 * consumption to an injected {@link QuotaService} so a single call site can
 * both meter and enforce.
 */
export class MeteringService {
  private readonly events: MeteringEvent[] = [];
  private readonly clock: () => Date;
  private readonly maxEvents: number;

  public constructor(private readonly options: MeteringServiceOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.maxEvents = options.maxEvents ?? 10_000;
  }

  public async record(
    tenantId: string,
    resource: QuotaResource,
    amount: number,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<MeteringEvent> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RangeError('Metering amount must be a positive finite number');
    }
    const event: MeteringEvent = {
      tenantId,
      resource,
      amount,
      timestamp: this.clock(),
      ...(metadata ? { metadata } : {}),
    };
    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }
    this.events.push(event);
    if (this.options.quotaService) {
      await this.options.quotaService.consume(tenantId, resource, amount);
    }
    return event;
  }

  public query(query: MeteringQuery): readonly MeteringEvent[] {
    return this.events.filter(
      (event) =>
        event.tenantId === query.tenantId &&
        (query.resource === undefined || event.resource === query.resource) &&
        (query.since === undefined || event.timestamp >= query.since),
    );
  }

  public total(query: MeteringQuery): number {
    return this.query(query).reduce((sum, event) => sum + event.amount, 0);
  }
}
