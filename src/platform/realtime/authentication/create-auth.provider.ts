import type { RealtimeAuthProvider } from '../contracts/realtime-authentication.interface';
import type {
  RealtimeAuthKind,
  RealtimeConfig,
} from '../configuration/realtime.config';
import { AnonymousRealtimeAuthProvider } from './anonymous.auth.provider';
import { ApiKeyRealtimeAuthProvider } from './api-key.auth.provider';
import { JwtRealtimeAuthProvider } from './jwt.auth.provider';

export function createRealtimeAuthProvider(
  config: Pick<RealtimeConfig, 'auth' | 'jwtSecret' | 'apiKeys'>,
): RealtimeAuthProvider {
  return createRealtimeAuthProviderByKind(config.auth, config);
}

export function createRealtimeAuthProviderByKind(
  kind: RealtimeAuthKind,
  config: Pick<RealtimeConfig, 'jwtSecret' | 'apiKeys'>,
): RealtimeAuthProvider {
  switch (kind) {
    case 'jwt':
      return new JwtRealtimeAuthProvider(config.jwtSecret);
    case 'api-key':
      return new ApiKeyRealtimeAuthProvider(config.apiKeys);
    case 'anonymous':
      return new AnonymousRealtimeAuthProvider(true);
    default:
      throw new RangeError(`Unknown realtime auth kind: ${String(kind)}`);
  }
}
