import { assertPositiveInteger } from '../../architecture/production-defaults';
import { WebhookDeadLetterStore } from './webhook-store.interface';
import { DeliveryStatus, WebhookDelivery } from './webhook.types';

export interface InMemoryWebhookDeliveryStoreOptions {
  /** Maximum retained deliveries. Defaults to 10_000. */
  readonly maxEntries?: number;
}

/**
 * Process-local webhook delivery store. **Not durable**.
 */
export class InMemoryWebhookDeliveryStore implements WebhookDeadLetterStore {
  private readonly deliveries = new Map<string, WebhookDelivery>();
  private readonly maxEntries: number;

  public constructor(options: InMemoryWebhookDeliveryStoreOptions = {}) {
    this.maxEntries = assertPositiveInteger(
      options.maxEntries ?? 10_000,
      'InMemoryWebhookDeliveryStore maxEntries',
    );
  }

  public save(delivery: WebhookDelivery): Promise<void> {
    if (
      !this.deliveries.has(delivery.id) &&
      this.deliveries.size >= this.maxEntries
    ) {
      return Promise.reject(
        new RangeError(
          `InMemoryWebhookDeliveryStore is full (maxEntries=${this.maxEntries})`,
        ),
      );
    }
    this.deliveries.set(delivery.id, Object.freeze({ ...delivery }));
    return Promise.resolve();
  }

  public find(id: string): Promise<WebhookDelivery | undefined> {
    return Promise.resolve(this.deliveries.get(id));
  }

  /** Lists deliveries by status — e.g. `'failed'` for a dead-letter view. */
  public listByStatus(status: DeliveryStatus): Promise<WebhookDelivery[]> {
    return Promise.resolve(
      [...this.deliveries.values()].filter(
        (delivery) => delivery.status === status,
      ),
    );
  }
}
