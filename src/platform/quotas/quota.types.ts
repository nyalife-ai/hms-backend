export type QuotaResource =
  'storage' | 'api_calls' | 'bandwidth' | 'processing_time';

export interface QuotaUsage {
  readonly tenantId: string;
  readonly resource: QuotaResource;
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
}

export interface QuotaCheckResult extends QuotaUsage {
  readonly allowed: boolean;
}

export interface MeteringEvent {
  readonly tenantId: string;
  readonly resource: QuotaResource;
  readonly amount: number;
  readonly timestamp: Date;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
