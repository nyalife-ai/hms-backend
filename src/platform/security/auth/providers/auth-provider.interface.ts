import type {
  AuthCredentials,
  AuthPrincipal,
  TokenPair,
} from '../tokens/token.types';

export interface AuthProvider {
  authenticate(credentials: AuthCredentials): Promise<AuthPrincipal | null>;
  issueTokens(principal: AuthPrincipal): Promise<TokenPair>;
  revoke(subject: string): Promise<void>;
}
