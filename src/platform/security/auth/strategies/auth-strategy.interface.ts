import type { AuthCredentials, AuthPrincipal } from '../tokens/token.types';

export interface AuthStrategy {
  readonly name: string;
  validate(credentials: AuthCredentials): Promise<AuthPrincipal | null>;
}
