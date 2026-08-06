import { Inject, Injectable } from '@nestjs/common';
import { AUTH_STRATEGIES } from '../tokens/auth.tokens';
import type { AuthCredentials, AuthPrincipal } from '../tokens/token.types';
import type { AuthStrategy } from '../strategies/auth-strategy.interface';

@Injectable()
export class AuthenticationService {
  private readonly strategies: ReadonlyMap<string, AuthStrategy>;

  public constructor(
    @Inject(AUTH_STRATEGIES) strategies: readonly AuthStrategy[],
  ) {
    this.strategies = new Map(
      strategies.map((strategy) => [strategy.name, strategy]),
    );
  }

  public async authenticate(
    strategyName: string,
    credentials: AuthCredentials,
  ): Promise<AuthPrincipal | null> {
    const strategy = this.strategies.get(strategyName);
    return strategy ? strategy.validate(credentials) : null;
  }
}
