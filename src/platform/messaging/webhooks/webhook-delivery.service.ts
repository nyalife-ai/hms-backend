import { NotFoundException } from '../../../core/exceptions/not-found.exception';
import { WebhookSigner } from './webhook-signer';
import {
  WebhookDeliveryStore,
  supportsDeadLetterListing,
} from './webhook-store.interface';
import {
  HttpClient,
  RetryPolicy,
  WebhookDelivery,
  WebhookDeliveryRequest,
} from './webhook.types';

export interface ReplayOptions {
  /** Re-signs the replayed payload with this secret; omit to send unsigned. */
  readonly secret?: string;
  readonly timeoutMs?: number;
}

export class WebhookDeliveryService {
  public constructor(
    private readonly client: HttpClient,
    private readonly store: WebhookDeliveryStore,
    private readonly retry: RetryPolicy,
    private readonly signer: WebhookSigner = new WebhookSigner(),
  ) {}

  public async deliver(
    request: WebhookDeliveryRequest,
  ): Promise<WebhookDelivery> {
    if (!request.id || !request.url) {
      throw new Error('Webhook id and URL are required');
    }
    const payload = JSON.stringify(request.payload);
    const initial: WebhookDelivery = {
      id: request.id,
      url: request.url,
      payload,
      status: 'pending',
      attempts: 0,
    };
    await this.store.save(initial);
    return this.attemptDelivery(initial, request.url, payload, {
      ...(request.secret === undefined ? {} : { secret: request.secret }),
      ...(request.timeoutMs === undefined
        ? {}
        : { timeoutMs: request.timeoutMs }),
    });
  }

  /**
   * Re-sends a previously stored delivery by id. The original payload is
   * reused verbatim; pass `secret` to re-sign it (the original secret is
   * never persisted).
   */
  public async replay(
    id: string,
    options: ReplayOptions = {},
  ): Promise<WebhookDelivery> {
    const existing = await this.store.find(id);
    if (!existing) {
      throw new NotFoundException('Webhook delivery', id);
    }
    const reset: WebhookDelivery = {
      ...existing,
      status: 'pending',
      attempts: 0,
      responseStatus: undefined,
      error: undefined,
    };
    await this.store.save(reset);
    return this.attemptDelivery(reset, existing.url, existing.payload, options);
  }

  /** Lists dead-lettered (`failed`) deliveries, when the store supports it. */
  public async listDeadLetters(): Promise<WebhookDelivery[]> {
    if (!supportsDeadLetterListing(this.store)) {
      throw new Error(
        'WebhookDeliveryService: configured store does not support dead-letter listing',
      );
    }
    return this.store.listByStatus('failed');
  }

  private async attemptDelivery(
    delivery: WebhookDelivery,
    url: string,
    payload: string,
    options: ReplayOptions,
  ): Promise<WebhookDelivery> {
    let current = delivery;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt += 1) {
      try {
        const signed = options.secret
          ? this.signer.sign(payload, options.secret)
          : undefined;
        const response = await this.client.request({
          url,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(signed
              ? {
                  'x-webhook-signature': signed.signature,
                  'x-webhook-timestamp': String(signed.timestamp),
                }
              : {}),
          },
          body: payload,
          timeoutMs: options.timeoutMs,
        });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Webhook returned HTTP ${response.status}`);
        }
        current = {
          ...current,
          status: 'delivered',
          attempts: attempt,
          responseStatus: response.status,
        };
        await this.store.save(current);
        return current;
      } catch (error: unknown) {
        current = {
          ...current,
          status: attempt === this.retry.maxAttempts ? 'failed' : 'pending',
          attempts: attempt,
          error:
            error instanceof Error ? error.message : 'Unknown delivery error',
        };
        await this.store.save(current);
        if (attempt < this.retry.maxAttempts) {
          await this.retry.delay(attempt);
        }
      }
    }
    return current;
  }
}
