import { HttpClient } from '../webhooks/webhook.types';

export interface PushMessage {
  readonly token: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Readonly<Record<string, string>>;
}
export interface PushResult {
  readonly provider: string;
  readonly messageId: string;
  readonly accepted: boolean;
}
export interface PushProvider {
  readonly name: string;
  send(message: PushMessage): Promise<PushResult>;
}
export interface PushHttpProviderOptions {
  readonly endpoint: string;
  readonly token?: string;
  readonly client: HttpClient;
}
