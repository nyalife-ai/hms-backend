export interface RealtimeAuthContext {
  readonly credentials?: string;
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
  readonly query?: Readonly<Record<string, string | string[] | undefined>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RealtimeAuthIdentity {
  readonly userId: string;
  readonly tenantId?: string;
  readonly roles?: readonly string[];
  readonly anonymous?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Authenticates inbound realtime connections.
 */
export interface RealtimeAuthProvider {
  readonly name: string;
  authenticate(
    context: RealtimeAuthContext,
  ): Promise<RealtimeAuthIdentity | undefined>;
}
