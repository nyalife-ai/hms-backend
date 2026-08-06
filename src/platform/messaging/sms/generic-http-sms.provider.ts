import {
  SmsHttpProviderOptions,
  SmsMessage,
  SmsProvider,
  SmsSendResult,
} from './sms-provider.interface';

export class GenericHttpSmsProvider implements SmsProvider {
  public readonly name: string;
  public constructor(
    private readonly options: SmsHttpProviderOptions,
    name = 'generic-http',
  ) {
    this.name = name;
  }

  public async send(message: SmsMessage): Promise<SmsSendResult> {
    const response = await this.options.client.request({
      url: this.options.endpoint,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.options.token
          ? { authorization: `Bearer ${this.options.token}` }
          : {}),
      },
      body: JSON.stringify(message),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${this.name} returned HTTP ${response.status}`);
    }
    return {
      provider: this.name,
      messageId: response.body ?? '',
      accepted: true,
    };
  }
}
