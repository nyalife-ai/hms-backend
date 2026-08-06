export type MfaMethod = 'totp' | 'sms' | 'email';

export interface MfaChallenge {
  readonly id: string;
  readonly method: MfaMethod;
  readonly expiresAt: Date;
}
