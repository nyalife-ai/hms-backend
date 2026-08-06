import type {
  RealtimeAuthContext,
  RealtimeAuthIdentity,
  RealtimeAuthProvider,
} from '../contracts/realtime-authentication.interface';

function readValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function extractBearer(context: RealtimeAuthContext): string | undefined {
  const fromCredentials = context.credentials?.trim();
  if (fromCredentials) return fromCredentials;
  const authorization = readValue(context.headers?.authorization);
  if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return readValue(context.query?.token);
}

/**
 * Lightweight JWT auth for realtime handshakes.
 * Validates a compact JWT shape and optional HMAC-SHA256 signature when a
 * secret is configured. Does not pull in @nestjs/jwt to keep the platform
 * layer free of Nest transport coupling.
 */
export class JwtRealtimeAuthProvider implements RealtimeAuthProvider {
  public readonly name = 'jwt';

  public constructor(private readonly secret?: string) {}

  public async authenticate(
    context: RealtimeAuthContext,
  ): Promise<RealtimeAuthIdentity | undefined> {
    const token = extractBearer(context);
    if (!token) return undefined;
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;
    try {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      if (this.secret) {
        const { createHmac, timingSafeEqual } = await import('node:crypto');
        const data = `${parts[0]}.${parts[1]}`;
        const expected = createHmac('sha256', this.secret)
          .update(data)
          .digest('base64url');
        const left = Buffer.from(expected);
        const right = Buffer.from(parts[2]);
        if (left.length !== right.length || !timingSafeEqual(left, right)) {
          return undefined;
        }
      }
      const exp = payload.exp;
      if (typeof exp === 'number' && exp * 1000 < Date.now()) {
        return undefined;
      }
      const userId =
        typeof payload.sub === 'string' && payload.sub
          ? payload.sub
          : typeof payload.userId === 'string' && payload.userId
            ? payload.userId
            : undefined;
      if (!userId) return undefined;
      return {
        userId,
        tenantId:
          typeof payload.tenantId === 'string' ? payload.tenantId : undefined,
        roles: Array.isArray(payload.roles)
          ? payload.roles.filter(
              (role): role is string => typeof role === 'string',
            )
          : undefined,
        anonymous: false,
      };
    } catch {
      return undefined;
    }
  }
}
