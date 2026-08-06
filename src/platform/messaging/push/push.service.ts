import {
  PushMessage,
  PushProvider,
  PushResult,
} from './push-provider.interface';

export class PushService {
  private readonly providers: ReadonlyMap<string, PushProvider>;
  public constructor(
    providers: readonly PushProvider[],
    private readonly maxAttempts = 3,
  ) {
    this.providers = new Map(
      providers.map((provider) => [provider.name, provider]),
    );
  }
  public async send(
    providerName: string,
    message: PushMessage,
  ): Promise<PushResult> {
    if (!message.token || !message.title || !message.body)
      throw new Error('Invalid push message');
    const provider = this.providers.get(providerName);
    if (!provider) throw new Error(`Unknown push provider: ${providerName}`);
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
      : new Error('Push delivery failed');
  }
}
