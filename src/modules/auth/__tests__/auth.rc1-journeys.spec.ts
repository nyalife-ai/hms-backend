/**
 * RC1 auth journey unit coverage — register / forgot OTP / verify / reset paths.
 */

import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthMailService } from '../auth-mail.service';
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
    twoFactorEnabled: false,
  };

  let users: jest.Mocked<IAuthUserRepository>;
  let audit: { recordMutation: jest.Mock; recordAccess: jest.Mock };
  let mail: { sendPasswordResetOtp: jest.Mock; sendLoginOtp: jest.Mock };
  let service: AuthService;
  let storedOtpHash: string | undefined;

  beforeEach(async () => {
    user.passwordHash = await bcrypt.hash('oldpass12', 4);
    storedOtpHash = undefined;
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByRole: jest.fn(),
      listActiveUsers: jest.fn(),
      touchLastLogin: jest.fn(),
      updatePasswordHash: jest.fn(),
      updateTwoFactorEnabled: jest.fn(),
      createRefreshToken: jest.fn().mockImplementation(async (input) => {
        if (input.userAgent === 'password-reset-otp') {
          storedOtpHash = input.tokenHash;
        }
      }),
      findRefreshByHash: jest.fn(),
      revokeRefreshByHash: jest.fn(),
      revokeAllForUser: jest.fn(),
      registerPatient: jest.fn(),
      findPasswordResetByHash: jest.fn(),
      findChallengeByHash: jest.fn(),
      revokeUserChallenges: jest.fn(),
      syncRoleModulePermissions: jest.fn().mockResolvedValue(undefined),
    };
    audit = {
      recordMutation: jest.fn().mockResolvedValue(undefined),
      recordAccess: jest.fn().mockResolvedValue(undefined),
    };
    mail = {
      sendPasswordResetOtp: jest
        .fn()
        .mockResolvedValue({ delivered: false, mode: 'log' }),
      sendLoginOtp: jest
        .fn()
        .mockResolvedValue({ delivered: false, mode: 'log' }),
    };
    service = new AuthService(
      { sign: jest.fn().mockReturnValue('access') } as unknown as JwtService,
      {
        get: jest.fn((key: string, def?: string) => {
          if (key === 'jwt.expiration') return '15m';
          if (key === 'jwt.secret') return 'test-secret-at-least-32-chars-long!!';
          if (key === 'JWT_REFRESH_DAYS') return '7';
          if (key === 'app.environment') return 'test';
          return def;
        }),
      } as unknown as ConfigService,
      users,
      audit as any,
      mail as unknown as AuthMailService,
      { emit: jest.fn() } as any,
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

  it('forgot password sends OTP challenge and never returns OTP in the response', async () => {
    users.findByEmail.mockResolvedValue(user);
    const res = await service.forgotPassword('p@test.com');
    expect(res.ok).toBe(true);
    expect((res as { devOtp?: string }).devOtp).toBeUndefined();
    const mailedOtp = mail.sendPasswordResetOtp.mock.calls[0][0].otp as string;
    expect(mailedOtp).toMatch(/^\d{6}$/);
    expect(users.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: 'password-reset-otp' }),
    );
    expect(mail.sendPasswordResetOtp).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'p@test.com', otp: mailedOtp }),
    );
    expect(audit.recordMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: { event: 'OTP_REQUESTED' },
      }),
    );
  });

  it('forgot password does not reveal missing accounts', async () => {
    users.findByEmail.mockResolvedValue(null);
    const res = await service.forgotPassword('missing@test.com');
    expect(res.ok).toBe(true);
    expect((res as { devOtp?: string }).devOtp).toBeUndefined();
    expect(users.createRefreshToken).not.toHaveBeenCalled();
  });

  it('verify reset OTP issues a reset session token', async () => {
    users.findByEmail.mockResolvedValue(user);
    await service.forgotPassword('p@test.com');
    const mailedOtp = mail.sendPasswordResetOtp.mock.calls[0][0].otp as string;
    users.findChallengeByHash.mockResolvedValue({
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    const verified = await service.verifyResetOtp('p@test.com', mailedOtp);
    expect(verified.resetToken.length).toBeGreaterThan(20);
    expect(users.createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: 'password-reset' }),
    );
  });

  it('verify reset OTP rejects wrong codes', async () => {
    users.findByEmail.mockResolvedValue(user);
    users.findChallengeByHash.mockResolvedValue(null);
    await expect(
      service.verifyResetOtp('p@test.com', '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verify reset OTP rejects non-digit codes', async () => {
    await expect(
      service.verifyResetOtp('p@test.com', 'abcdef'),
    ).rejects.toBeInstanceOf(BadRequestException);
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
