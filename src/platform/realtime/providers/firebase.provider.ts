import { UnconfiguredRealtimeProvider } from './unconfigured.provider';

export class FirebaseRealtimeProvider extends UnconfiguredRealtimeProvider {
  public readonly name = 'firebase' as const;

  protected notConfigured(operation: string): Error {
    return new Error(
      `FirebaseRealtimeProvider.${operation} is not configured. Provide credentials or switch REALTIME_PROVIDER.`,
    );
  }
}
