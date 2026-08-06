import { UnconfiguredRealtimeProvider } from './unconfigured.provider';

export class PusherRealtimeProvider extends UnconfiguredRealtimeProvider {
  public readonly name = 'pusher' as const;

  protected notConfigured(operation: string): Error {
    return new Error(
      `PusherRealtimeProvider.${operation} is not configured. Provide credentials or switch REALTIME_PROVIDER.`,
    );
  }
}
