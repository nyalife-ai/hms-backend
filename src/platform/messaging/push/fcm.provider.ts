import {
  PushHttpProviderOptions,
  PushMessage,
  PushProvider,
  PushResult,
} from './push-provider.interface';

export class FcmPushProvider implements PushProvider {
  public readonly name = 'fcm';
  public constructor(private readonly options: PushHttpProviderOptions) {}
  public async send(message: PushMessage): Promise<PushResult> {
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
    if (response.status < 200 || response.status >= 300)
      throw new Error(`FCM returned HTTP ${response.status}`);
    return {
      provider: this.name,
      messageId: response.body ?? '',
      accepted: true,
    };
  }
}
