import { Injectable } from '@nestjs/common';
import { DomainException } from '../../../core';
import type { MfaProvider } from './mfa-provider.interface';
import type { MfaChallenge, MfaMethod } from './mfa.types';

@Injectable()
export class MfaService {
  private readonly providers = new Map<MfaMethod, MfaProvider>();

  public register(provider: MfaProvider): void {
    this.providers.set(provider.method, provider);
  }

  public challenge(
    method: MfaMethod,
    principalId: string,
  ): Promise<MfaChallenge> {
    const provider = this.get(method);
    return provider.challenge(principalId);
  }

  public verify(
    method: MfaMethod,
    challengeId: string,
    code: string,
  ): Promise<boolean> {
    return this.get(method).verify(challengeId, code);
  }

  private get(method: MfaMethod): MfaProvider {
    const provider = this.providers.get(method);
    if (!provider)
      throw new DomainException(`MFA provider not configured: ${method}`);
    return provider;
  }
}
