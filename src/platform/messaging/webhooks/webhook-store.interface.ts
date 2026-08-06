import { DeliveryStatus, WebhookDelivery } from './webhook.types';

export interface WebhookDeliveryStore {
  save(delivery: WebhookDelivery): Promise<void>;
  find(id: string): Promise<WebhookDelivery | undefined>;
}

/**
 * Optional capability for stores that can enumerate deliveries by status —
 * used to list dead-lettered (`failed`) webhook deliveries for inspection
 * or manual replay. Kept separate from {@link WebhookDeliveryStore} so
 * minimal store implementations (and test doubles) aren't forced to
 * implement it.
 */
export interface WebhookDeadLetterStore extends WebhookDeliveryStore {
  listByStatus(status: DeliveryStatus): Promise<WebhookDelivery[]>;
}

export function supportsDeadLetterListing(
  store: WebhookDeliveryStore,
): store is WebhookDeadLetterStore {
  return (
    typeof (store as Partial<WebhookDeadLetterStore>).listByStatus ===
    'function'
  );
}
