export interface BrokerMessage<T = unknown> {
  readonly id: string;
  readonly topic: string;
  readonly payload: T;
  readonly attempt: number;
  ack(): Promise<void>;
  nack(retry?: boolean): Promise<void>;
}

export type MessageHandler<T = unknown> = (
  message: BrokerMessage<T>,
) => Promise<void>;
export type Unsubscribe = () => void;

export interface MessageBroker {
  publish<T>(topic: string, payload: T): Promise<string>;
  subscribe<T>(topic: string, handler: MessageHandler<T>): Unsubscribe;
}

/** Optional lifecycle port for brokers that own external connections. */
export interface LifecycleMessageBroker extends MessageBroker {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
