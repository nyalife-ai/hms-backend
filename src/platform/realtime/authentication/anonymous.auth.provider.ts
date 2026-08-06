import type {
  RealtimeAuthContext,
  RealtimeAuthIdentity,
  RealtimeAuthProvider,
} from '../contracts/realtime-authentication.interface';

export class AnonymousRealtimeAuthProvider implements RealtimeAuthProvider {
  public readonly name = 'anonymous';

  public constructor(private readonly allow = true) {}

  public async authenticate(
    context: RealtimeAuthContext,
  ): Promise<RealtimeAuthIdentity | undefined> {
    await Promise.resolve();
    if (!this.allow) return undefined;
    const userId =
      (typeof context.metadata?.guestId === 'string' &&
        context.metadata.guestId) ||
      `anon:${Date.now().toString(36)}`;
    return {
      userId,
      anonymous: true,
      roles: ['anonymous'],
      metadata: { auth: 'anonymous' },
    };
  }
}
