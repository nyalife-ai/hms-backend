export interface SessionRecord {
  readonly id: string;
  readonly principalId: string;
  readonly roles: readonly string[];
  readonly deviceId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly refreshTokenHash: string;
  readonly revoked: boolean;
}
