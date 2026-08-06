import { HttpClient } from '../webhooks/webhook.types';

export interface SmsMessage {
  readonly to: string;
  readonly from?: string;
  readonly body: string;
}

export interface SmsSendResult {
  readonly provider: string;
  readonly messageId: string;
  readonly accepted: boolean;
}

export interface SmsProvider {
  readonly name: string;
  send(message: SmsMessage): Promise<SmsSendResult>;
}

export interface SmsHttpProviderOptions {
  readonly endpoint: string;
  readonly token?: string;
  readonly client: HttpClient;
}
