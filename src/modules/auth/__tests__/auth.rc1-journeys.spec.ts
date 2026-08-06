/**
 * RC1 auth journey unit coverage — register / forgot / reset paths.
 */

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import type { IAuthUserRepository } from '../repositories/auth-user.repository.interface';
import type { AuthUser } from '../auth.types';

describe('AuthService RC1 journeys', () => {
  const user: AuthUser = {
    id: 'u1',
    email: 'p@test.com',
    name: 'Pat',
    role: 'PATIENT',
    position: 'PATIENT',
    passwordHash: '',
    permissions: [],
  };

  let users: jest.Mocked<IAuthUserRepository>;
  let audit: { recordMutation: jest.Mock; recordAccess: jest.Mock };
  let service: AuthService;

  beforeEach(async () => {
    user.passwordHash = await bcrypt.hash('oldpass12', 4);
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByRole: jest.fn(),
      listActiveUsers: jest.fn(),
      touchLastLogin: jest.fn(),
      updatePasswordHash: jest.fn(),
      createRefreshToken: jest.fn(),
      findRefreshByHash: jest.fn(),
      revokeRefreshByHash: jest.fn(),
      revokeAllForUser: jest.fn(),
      registerPatient: jest.fn(),
      findPasswordResetByHash: jest.fn(),
      syncRoleModulePermissions: jest.fn().mockResolvedValue(undefined),
    };
    audit = {
      recordMutation: jest.fn().mockResolvedValue(undefined),
      recordAccess: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      { sign: jest.fn().mockReturnValue('access') } as unknown as JwtService,
      {
        get: jest.fn((key: string, def?: string) => {
          if (key === 'jwt.expiration') return '15m';
          if (key === 'JWT_REFRESH_DAYS') return '7';
          if (key === 'app.environment') return 'test';
          return def;
        }),
      } as unknown as ConfigService,
      users,
      audit as any,
    );
  });

  it('registers a patient and issues a session + audit', async () => {
    users.registerPatient.mockResolvedValue({
      userId: 'u1',
      patientId: 'p1',
      mrn: 'MRN-10001',
    });
    users.findById.mockResolvedValue(user);
    const res = await service.registerPatient({
      email: 'p@test.com',
      password: 'newpass12',
      firstName: 'Pat',
      lastName: 'Ient',
    });
    expect(res.accessToken).toBe('access');
    expect(audit.recordMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'patients.patients',
      }),
    );
  });

  it('maps duplicate email to ConflictException', async () => {
    users.registerPatient.mockRejectedValue(new Error('Email already registered'));
    await expect(
      service.registerPatient({
        email: 'p@test.com',
        password: 'newpass12',
        firstName: 'Pat',
        lastName: 'Ient',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forgot password returns resetToken outside production and audits', async () => {
    users.findByEmail.mockResolvedValue(user);
    const res = await service.forgotPassword('p@test.com');
    expect(res.ok).toBe(true);
    expect(res.resetToken).toBeDefined();
    expect(users.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: 'password-reset' }),
    );
    expect(audit.recordMutation).toHaveBeenCalled();
  });

  it('reset password rejects invalid token', async () => {
    users.findPasswordResetByHash.mockResolvedValue(null);
    await expect(
      service.resetPassword('invalid-reset-token-value-xx', 'brandnew1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reset password updates hash and audits', async () => {
    users.findPasswordResetByHash.mockResolvedValue({
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    const res = await service.resetPassword(
      'valid-reset-token-value-xxxx',
      'brandnew1',
    );
    expect(res.ok).toBe(true);
    expect(users.updatePasswordHash).toHaveBeenCalled();
    expect(users.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(audit.recordMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'auth.password',
        newValues: { event: 'PASSWORD_RESET' },
      }),
    );
  });
});
