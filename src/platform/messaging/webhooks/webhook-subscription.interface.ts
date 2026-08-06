export interface WebhookSubscription {
  readonly id: string;
  readonly url: string;
  /** Event types this subscription receives. `"*"` matches every event type. */
  readonly eventTypes: readonly string[];
  readonly secret?: string;
  readonly active: boolean;
}

export interface RegisterWebhookSubscriptionInput {
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly secret?: string;
}

/**
 * Registry mapping event types to webhook subscription endpoints.
 * Infrastructure adapters back this with durable storage;
 * {@link InMemoryWebhookSubscriptionRegistry} is the process-local reference
 * implementation used in tests and single-instance deployments.
 */
export interface WebhookSubscriptionRegistry {
  register(
    input: RegisterWebhookSubscriptionInput,
  ): Promise<WebhookSubscription>;
  unregister(id: string): Promise<boolean>;
  setActive(id: string, active: boolean): Promise<WebhookSubscription>;
  findByEventType(eventType: string): Promise<WebhookSubscription[]>;
  list(): Promise<WebhookSubscription[]>;
}
