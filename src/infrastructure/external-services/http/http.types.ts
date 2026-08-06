import type { CircuitBreaker } from '../../../platform/reliability';
import type { RetryExecutor, RetryPolicy } from '../../../platform/reliability';
import type { StructuredLogger, Tracer } from '../../../platform/observability';
import type { OutboundUrlPolicy } from './outbound-url.policy';

export interface FetchResponsePort {
  readonly status: number;
  text(): Promise<string>;
}
export type FetchPort = (
  input: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly signal: AbortSignal;
    /** Always set to `'error'` by the client so redirects cannot bypass policy. */
    readonly redirect: 'error';
  },
) => Promise<FetchResponsePort>;
export interface TimerPort {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}
export interface CircuitBreakerPort {
  execute<T>(operation: () => Promise<T> | T): Promise<T>;
}
export interface HttpClientServiceOptions {
  readonly fetch?: FetchPort;
  readonly timer?: TimerPort;
  readonly retryExecutor?: RetryExecutor;
  readonly retryPolicy?: RetryPolicy;
  readonly circuitBreaker?: CircuitBreaker | CircuitBreakerPort;
  readonly logger?: StructuredLogger;
  readonly tracer?: Tracer;
  readonly defaultTimeoutMs?: number;
  /** Injectable outbound URL policy (SSRF controls). Defaults to production policy. */
  readonly urlPolicy?: OutboundUrlPolicy;
}
