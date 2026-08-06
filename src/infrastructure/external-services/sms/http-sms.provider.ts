import type {
  SmsMessage,
  SmsProvider,
  SmsSendResult,
} from '../../../platform/messaging/sms/sms-provider.interface';
import type { HttpClient } from '../../../platform/messaging/webhooks/webhook.types';

export interface HttpSmsProviderOptions {
  readonly endpoint: string;
  readonly client: HttpClient;
  readonly token?: string;
  readonly name?: string;
  readonly timeoutMs?: number;
}

export class HttpSmsProvider implements SmsProvider {
  public readonly name: string;

  public constructor(private readonly options: HttpSmsProviderOptions) {
    this.name = options.name ?? 'http-sms';
  }

  public async send(message: SmsMessage): Promise<SmsSendResult> {
    const response = await this.options.client.request({
      url: this.options.endpoint,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.options.token === undefined
          ? {}
          : { authorization: `Bearer ${this.options.token}` }),
      },
      body: JSON.stringify(message),
      ...(this.options.timeoutMs === undefined
        ? {}
        : { timeoutMs: this.options.timeoutMs }),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`SMS provider returned HTTP ${response.status}`);
    }
    return {
      provider: this.name,
      messageId: messageId(response.body),
      accepted: true,
    };
  }
}

function messageId(body: string | undefined): string {
  if (body === undefined || body.length === 0) return '';
  try {
    const value = JSON.parse(body) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'messageId' in value &&
      typeof value.messageId === 'string'
    ) {
      return value.messageId;
    }
  } catch {
    return body;
  }
  return body;
}
