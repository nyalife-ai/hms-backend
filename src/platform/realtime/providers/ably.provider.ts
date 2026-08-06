import { UnconfiguredRealtimeProvider } from './unconfigured.provider';

export class AblyRealtimeProvider extends UnconfiguredRealtimeProvider {
  public readonly name = 'ably' as const;

  protected notConfigured(operation: string): Error {
    return new Error(
      `AblyRealtimeProvider.${operation} is not configured. Provide credentials or switch REALTIME_PROVIDER.`,
    );
  }
}
