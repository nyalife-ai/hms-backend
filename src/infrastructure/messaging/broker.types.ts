export interface BrokerAdapterOptions {
  readonly maxRetries?: number;
  readonly deadLetterTopic?: string;
  readonly ackTimeoutMs?: number;
}

export interface DriverDelivery {
  readonly id: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly attempt?: number;
  ack(): Promise<void>;
  nack(retry?: boolean): Promise<void>;
}

export type DriverDeliveryHandler = (message: DriverDelivery) => Promise<void>;
export type DriverUnsubscribe = () => void;

export interface BrokerDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, payload: unknown, attempt?: number): Promise<string>;
  subscribe(topic: string, handler: DriverDeliveryHandler): DriverUnsubscribe;
  onDisconnect?(handler: () => void): DriverUnsubscribe;
}

export interface BrokerLogger {
  error(message: string): void;
}
