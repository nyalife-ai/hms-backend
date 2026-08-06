import {
  SmsMessage,
  SmsProvider,
  SmsSendResult,
} from './sms-provider.interface';

export class SmsService {
  private readonly providers: ReadonlyMap<string, SmsProvider>;
  public constructor(
    providers: readonly SmsProvider[],
    private readonly maxAttempts = 3,
  ) {
    this.providers = new Map(
      providers.map((provider) => [provider.name, provider]),
    );
  }
  public async send(
    providerName: string,
    message: SmsMessage,
  ): Promise<SmsSendResult> {
    if (!message.to || !message.body) throw new Error('Invalid SMS message');
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown SMS provider: ${providerName}`);
    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        return await provider.send(message);
      } catch (error: unknown) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('SMS delivery failed');
  }
}
