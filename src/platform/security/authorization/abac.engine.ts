import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from './types';

export interface AbacPolicy {
  readonly name: string;
  evaluate(context: AuthorizationContext): boolean | Promise<boolean>;
}

@Injectable()
export class AbacEngine {
  private readonly policies: AbacPolicy[] = [];

  public addPolicy(policy: AbacPolicy): void {
    this.policies.push(policy);
  }

  public async can(context: AuthorizationContext): Promise<boolean> {
    if (this.policies.length === 0) return false;
    const results = await Promise.all(
      this.policies.map((policy) => Promise.resolve(policy.evaluate(context))),
    );
    return results.some(Boolean);
  }
}
