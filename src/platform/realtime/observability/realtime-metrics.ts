export interface RealtimeMetricsSnapshot {
  readonly connects: number;
  readonly disconnects: number;
  readonly authFailures: number;
  readonly heartbeats: number;
  readonly publishes: number;
  readonly publishesByTarget: Readonly<Record<string, number>>;
}

export interface RealtimeMetrics {
  recordConnect(): void;
  recordDisconnect(): void;
  recordAuthFailure(): void;
  recordHeartbeat(): void;
  recordPublish(target: string): void;
  snapshot(): RealtimeMetricsSnapshot;
}

export class InMemoryRealtimeMetrics implements RealtimeMetrics {
  private connects = 0;
  private disconnects = 0;
  private authFailures = 0;
  private heartbeats = 0;
  private publishes = 0;
  private readonly publishesByTarget = new Map<string, number>();

  public recordConnect(): void {
    this.connects += 1;
  }

  public recordDisconnect(): void {
    this.disconnects += 1;
  }

  public recordAuthFailure(): void {
    this.authFailures += 1;
  }

  public recordHeartbeat(): void {
    this.heartbeats += 1;
  }

  public recordPublish(target: string): void {
    this.publishes += 1;
    const key = target.trim() || 'unknown';
    this.publishesByTarget.set(key, (this.publishesByTarget.get(key) ?? 0) + 1);
  }

  public snapshot(): RealtimeMetricsSnapshot {
    return {
      connects: this.connects,
      disconnects: this.disconnects,
      authFailures: this.authFailures,
      heartbeats: this.heartbeats,
      publishes: this.publishes,
      publishesByTarget: Object.fromEntries(this.publishesByTarget),
    };
  }
}
