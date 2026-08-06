import type { MfaChallenge, MfaMethod } from './mfa.types';

export interface MfaProvider {
  readonly method: MfaMethod;
  challenge(principalId: string): Promise<MfaChallenge>;
  verify(challengeId: string, code: string): Promise<boolean>;
}
