/**
 * Handles a single event type. Implementations live in modules / platform.
 */
export interface EventHandler<TEvent> {
  readonly eventType: string;
  handle(event: TEvent): Promise<void>;
}
