/**
 * Auth persistence port — users + refresh tokens (db.sql core.*).
 */

import type { AuthUser, HmsRole } from '../auth.types';

export const AUTH_USER_REPOSITORY = Symbol('AUTH_USER_REPOSITORY');

export type RefreshTokenRecord = {
  userId: string;
  expiresAt: Date;
  revokedAt?: Date | null;
};

export interface IAuthUserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  findByRole(role: HmsRole): Promise<AuthUser | null>;
  listActiveUsers(): Promise<AuthUser[]>;
  touchLastLogin(userId: string): Promise<void>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  updateTwoFactorEnabled(userId: string, enabled: boolean): Promise<void>;
  createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<void>;
  findRefreshByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshByHash(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  registerPatient(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    dateOfBirth?: string;
  }): Promise<{ userId: string; patientId: string; mrn: string }>;
  findPasswordResetByHash(
    tokenHash: string,
  ): Promise<{ userId: string; expiresAt: Date; revokedAt?: Date | null } | null>;
  /** Find a challenge/token row by hash + exact user_agent marker. */
  findChallengeByHash(
    tokenHash: string,
    userAgent: string,
  ): Promise<{ userId: string; expiresAt: Date; revokedAt?: Date | null } | null>;
  /** Revoke outstanding reset/OTP challenges for a user. */
  revokeUserChallenges(userId: string, userAgents: string[]): Promise<void>;
  /** Align core.role_permissions with ROLE_MODULE_ACCESS (add + remove). */
  syncRoleModulePermissions(): Promise<void>;
}

