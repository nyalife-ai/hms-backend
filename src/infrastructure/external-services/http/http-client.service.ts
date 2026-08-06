import { Injectable } from '@nestjs/common';
import type {
  HttpClient,
  HttpRequest,
  HttpResponse,
} from '../../../platform/messaging/webhooks/webhook.types';
import { RetryExecutor, RetryPolicy } from '../../../platform/reliability';
import type { Span } from '../../../platform/observability';
import type {
  FetchPort,
  HttpClientServiceOptions,
  TimerPort,
} from './http.types';
import {
  OutboundUrlPolicyError,
  productionOutboundUrlPolicy,
  type OutboundUrlPolicy,
} from './outbound-url.policy';

const timer: TimerPort = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};
const fetchPort: FetchPort = (input, init) =>
  fetch(input, { ...init, redirect: 'error' });

export class ExternalHttpError extends Error {
  public constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ExternalHttpError';
  }
}

@Injectable()
export class HttpClientService implements HttpClient {
  private readonly fetcher: FetchPort;
  private readonly timer: TimerPort;
  private readonly retryExecutor: RetryExecutor;
  private readonly retryPolicy: RetryPolicy;
  private readonly urlPolicy: OutboundUrlPolicy;

  public constructor(private readonly options: HttpClientServiceOptions = {}) {
    this.fetcher = options.fetch ?? fetchPort;
    this.timer = options.timer ?? timer;
    this.retryExecutor = options.retryExecutor ?? new RetryExecutor();
    this.retryPolicy =
      options.retryPolicy ?? new RetryPolicy({ maxAttempts: 3, delayMs: 100 });
    this.urlPolicy = options.urlPolicy ?? productionOutboundUrlPolicy;
  }

  public async request(request: HttpRequest): Promise<HttpResponse> {
    // Validate before any retry / fetch attempt so policy failures never call fetch.
    try {
      await this.urlPolicy.assertSafe(request.url);
    } catch (error: unknown) {
      if (error instanceof OutboundUrlPolicyError) {
        throw new ExternalHttpError(error.message);
      }
      throw new ExternalHttpError('Outbound URL policy check failed');
    }

    const operation = (): Promise<HttpResponse> =>
      this.retryExecutor.execute(
        (attempt) => this.fetchOnce(request, attempt),
        this.retryPolicy,
      );
    return this.options.circuitBreaker === undefined
      ? operation()
      : this.options.circuitBreaker.execute(operation);
  }

  private async fetchOnce(
    request: HttpRequest,
    attempt: number,
  ): Promise<HttpResponse> {
    const span = this.options.tracer?.startSpan('external.http.request', {
      attributes: {
        method: request.method,
        attempt,
        url: safeUrl(request.url),
      },
    });
    const controller = new AbortController();
    const timeoutMs =
      request.timeoutMs ?? this.options.defaultTimeoutMs ?? 10_000;
    const timeout = this.timer.set(() => controller.abort(), timeoutMs);
    this.options.logger?.info('External HTTP request started', {
      method: request.method,
      url: safeUrl(request.url),
      attempt,
      headers: redactHeaders(request.headers),
    });
    try {
      const response = await this.fetcher(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
        redirect: 'error',
      });
      const body = await response.text();
      if (response.status < 200 || response.status >= 300) {
        throw new ExternalHttpError(
          `External service returned HTTP ${response.status}`,
          response.status,
        );
      }
      span?.setAttribute('http.status_code', response.status);
      this.options.logger?.info('External HTTP request completed', {
        status: response.status,
        url: safeUrl(request.url),
      });
      return { status: response.status, ...(body === '' ? {} : { body }) };
    } catch (error: unknown) {
      const safe = safeError(error, controller.signal.aborted);
      recordError(span, safe);
      this.options.logger?.warn('External HTTP request failed', {
        url: safeUrl(request.url),
        attempt,
        error: safe.message,
      });
      throw safe;
    } finally {
      this.timer.clear(timeout);
      span?.end();
    }
  }
}

function redactHeaders(
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      /authorization|token|api[-_]?key|cookie/i.test(key)
        ? '[REDACTED]'
        : value,
    ]),
  );
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|key|password|authorization/i.test(key)) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
}

function safeError(error: unknown, timedOut: boolean): ExternalHttpError {
  if (timedOut) return new ExternalHttpError('External request timed out');
  if (error instanceof ExternalHttpError) return error;
  return new ExternalHttpError('External request failed');
}

function recordError(span: Span | undefined, error: Error): void {
  span?.recordException(error);
}
