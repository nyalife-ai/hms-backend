/**
 * Publishes application / domain / integration events.
 * Concrete brokers (in-memory, Kafka, SNS) belong in platform.
 */
export interface EventBus {
  publish(event: unknown): Promise<void>;
  publishAll(events: ReadonlyArray<unknown>): Promise<void>;
}
