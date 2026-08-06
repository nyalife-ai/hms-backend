import { timingSafeEqual } from 'node:crypto';
import type {
  RealtimeAuthContext,
  RealtimeAuthIdentity,
  RealtimeAuthProvider,
} from '../contracts/realtime-authentication.interface';

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class ApiKeyRealtimeAuthProvider implements RealtimeAuthProvider {
  public readonly name = 'api-key';

  public constructor(private readonly apiKeys: readonly string[]) {}

  public async authenticate(
    context: RealtimeAuthContext,
  ): Promise<RealtimeAuthIdentity | undefined> {
    await Promise.resolve();
    const key =
      context.credentials?.trim() ||
      firstHeader(context.headers?.['x-api-key'])?.trim() ||
      firstHeader(context.query?.apiKey)?.trim();
    if (!key || this.apiKeys.length === 0) return undefined;
    const matched = this.apiKeys.some((allowed) => safeEqual(allowed, key));
    if (!matched) return undefined;
    const userId =
      firstHeader(context.headers?.['x-user-id'])?.trim() ||
      firstHeader(context.query?.userId)?.trim() ||
      `api-key:${key.slice(0, 8)}`;
    const tenantId =
      firstHeader(context.headers?.['x-tenant-id'])?.trim() ||
      firstHeader(context.query?.tenantId)?.trim();
    return {
      userId,
      tenantId,
      roles: ['api-key'],
      anonymous: false,
      metadata: { auth: 'api-key' },
    };
  }
}
