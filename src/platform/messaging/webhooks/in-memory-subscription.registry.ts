import { randomUUID } from 'node:crypto';
import { NotFoundException } from '../../../core/exceptions/not-found.exception';
import type {
  RegisterWebhookSubscriptionInput,
  WebhookSubscription,
  WebhookSubscriptionRegistry,
} from './webhook-subscription.interface';

const WILDCARD_EVENT_TYPE = '*';

/**
 * Process-local {@link WebhookSubscriptionRegistry}. **Not durable** —
 * subscriptions are lost on restart.
 */
export class InMemoryWebhookSubscriptionRegistry implements WebhookSubscriptionRegistry {
  private readonly subscriptions = new Map<string, WebhookSubscription>();

  public constructor(private readonly idGenerator: () => string = randomUUID) {}

  public async register(
    input: RegisterWebhookSubscriptionInput,
  ): Promise<WebhookSubscription> {
    await Promise.resolve();
    if (input.eventTypes.length === 0) {
      throw new RangeError(
        'Webhook subscription requires at least one event type',
      );
    }
    const subscription: WebhookSubscription = {
      id: this.idGenerator(),
      url: input.url,
      eventTypes: [...input.eventTypes],
      ...(input.secret === undefined ? {} : { secret: input.secret }),
      active: true,
    };
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  public async unregister(id: string): Promise<boolean> {
    await Promise.resolve();
    return this.subscriptions.delete(id);
  }

  public async setActive(
    id: string,
    active: boolean,
  ): Promise<WebhookSubscription> {
    await Promise.resolve();
    const updated = { ...this.require(id), active };
    this.subscriptions.set(id, updated);
    return updated;
  }

  public async findByEventType(
    eventType: string,
  ): Promise<WebhookSubscription[]> {
    await Promise.resolve();
    return [...this.subscriptions.values()].filter(
      (subscription) =>
        subscription.active &&
        (subscription.eventTypes.includes(WILDCARD_EVENT_TYPE) ||
          subscription.eventTypes.includes(eventType)),
    );
  }

  public async list(): Promise<WebhookSubscription[]> {
    await Promise.resolve();
    return [...this.subscriptions.values()];
  }

  private require(id: string): WebhookSubscription {
    const subscription = this.subscriptions.get(id);
    if (!subscription) {
      throw new NotFoundException('Webhook subscription', id);
    }
    return subscription;
  }
}
