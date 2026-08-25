/**
 * AuthService unit tests with repository mock.
 */

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthMailService } from '../auth-mail.service';
import { AuthService } from '../auth.service';
import type { IAuthUserRepository } from '../repositories/auth-user.repository.interface';
import type { AuthUser } from '../auth.types';

describe('AuthService', () => {
  const user: AuthUser = {
    id: 'u1',
    email: 'a@test.com',
    name: 'A',
    role: 'ADMIN',
    position: 'Admin',
    passwordHash: '',
    permissions: ['admin'],
    twoFactorEnabled: false,
  };

  let users: jest.Mocked<IAuthUserRepository>;
  let service: AuthService;
  let prisma: {
    profiles: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let dispatcher: { enqueueIntent: jest.Mock };

  beforeEach(async () => {
    user.passwordHash = await bcrypt.hash('secret123', 4);
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByRole: jest.fn(),
      listActiveUsers: jest.fn(),
      touchLastLogin: jest.fn(),
      updatePasswordHash: jest.fn(),
      updateTwoFactorEnabled: jest.fn(),
      createRefreshToken: jest.fn(),
      findRefreshByHash: jest.fn(),
      revokeRefreshByHash: jest.fn(),
      revokeAllForUser: jest.fn(),
      registerPatient: jest.fn(),
      findPasswordResetByHash: jest.fn(),
      findChallengeByHash: jest.fn(),
      revokeUserChallenges: jest.fn(),
      syncRoleModulePermissions: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      profiles: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    dispatcher = { enqueueIntent: jest.fn().mockResolvedValue({ queued: 1, persisted: 1 }) };
    service = new AuthService(
      { sign: jest.fn().mockReturnValue('access') } as unknown as JwtService,
      {
        get: jest.fn((key: string, def?: string) => {
          if (key === 'jwt.expiration') return '15m';
          if (key === 'jwt.secret') return 'test-secret-at-least-32-chars-long!!';
          if (key === 'JWT_REFRESH_DAYS') return '7';
          if (key === 'ENABLE_DEMO_AUTH') return 'false';
          if (key === 'app.environment') return 'test';
          return def;
        }),
      } as unknown as ConfigService,
      users,
      {
        recordMutation: jest.fn().mockResolvedValue(undefined),
        recordAccess: jest.fn().mockResolvedValue(undefined),
      } as any,
      {
        sendPasswordResetOtp: jest
          .fn()
          .mockResolvedValue({ delivered: false, mode: 'log' }),
        sendLoginOtp: jest
          .fn()
          .mockResolvedValue({ delivered: false, mode: 'log' }),
      } as unknown as AuthMailService,
      { emit: jest.fn() } as any,
      prisma as any,
      dispatcher as any,
      undefined,
    );
  });

  it('logs in with valid credentials', async () => {
    users.findByEmail.mockResolvedValue(user);
    const res = await service.login('a@test.com', 'secret123');
    expect('accessToken' in res && res.accessToken).toBe('access');
    expect(users.createRefreshToken).toHaveBeenCalled();
    expect(users.touchLastLogin).toHaveBeenCalledWith('u1');
  });

  it('requires 2FA when enabled', async () => {
    users.findByEmail.mockResolvedValue({ ...user, twoFactorEnabled: true });
    const res = await service.login('a@test.com', 'secret123');
    expect(res).toEqual(
      expect.objectContaining({
        twoFactorRequired: true,
        hash: expect.any(String),
      }),
    );
    expect(users.touchLastLogin).not.toHaveBeenCalled();
  });

  it('rejects bad password', async () => {
    users.findByEmail.mockResolvedValue(user);
    await expect(service.login('a@test.com', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects invalid refresh token', async () => {
    users.findRefreshByHash.mockResolvedValue(null);
    await expect(
      service.refresh('invalid-refresh-token-value'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reports demo auth disabled in test config', () => {
    expect(service.isDemoAuthEnabled()).toBe(false);
  });

  it('forgotPassword always returns opaque success', async () => {
    users.findByEmail.mockResolvedValue(null);
    const res = await service.forgotPassword('missing@test.com');
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/one-time code/i);
  });

  it('forgotPassword emails OTP when user exists', async () => {
    users.findByEmail.mockResolvedValue(user);
    const res = await service.forgotPassword('a@test.com', { ip: '1.1.1.1' });
    expect(res.ok).toBe(true);
    expect(users.createRefreshToken).toHaveBeenCalled();
    expect(users.revokeUserChallenges).toHaveBeenCalled();
  });

  it('registerPatient issues a session', async () => {
    users.registerPatient.mockResolvedValue({
      userId: 'u1',
      patientId: 'p1',
      mrn: 'MRN-1',
    });
    users.findById.mockResolvedValue(user);
    const res = await service.registerPatient({
      email: 'a@test.com',
      password: 'secret123',
      firstName: 'A',
      lastName: 'Test',
    });
    expect('accessToken' in res && res.accessToken).toBe('access');
  });

  it('setTwoFactorEnabled updates flag', async () => {
    users.findById.mockResolvedValue(user);
    const res = await service.setTwoFactorEnabled('u1', true);
    expect(users.updateTwoFactorEnabled).toHaveBeenCalledWith('u1', true);
    expect(res.id).toBe('u1');
  });

  it('logout revokes one refresh or all sessions', async () => {
    await service.logout('u1', 'refresh-token-value');
    expect(users.revokeRefreshByHash).toHaveBeenCalled();
    await service.logout('u1');
    expect(users.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  it('me and validateAccessUser return public user', async () => {
    users.findById.mockResolvedValue(user);
    await expect(service.me('u1')).resolves.toEqual(
      expect.objectContaining({ id: 'u1', email: 'a@test.com' }),
    );
    await expect(service.validateAccessUser('u1')).resolves.toEqual(
      expect.objectContaining({ id: 'u1' }),
    );
    users.findById.mockResolvedValue(null);
    await expect(service.validateAccessUser('missing')).resolves.toBeNull();
  });

  it('changePassword rejects wrong current password', async () => {
    users.findById.mockResolvedValue(user);
    await expect(
      service.changePassword('u1', 'wrong', 'newpass12'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changePassword updates hash and revokes sessions', async () => {
    users.findById.mockResolvedValue(user);
    await expect(
      service.changePassword('u1', 'secret123', 'newpass12'),
    ).resolves.toEqual({ ok: true });
    expect(users.updatePasswordHash).toHaveBeenCalled();
    expect(users.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  it('listDemoAccounts is empty when demo auth is off', async () => {
    await expect(service.listDemoAccounts()).resolves.toEqual([]);
  });

  it('onModuleInit syncs permissions and swallows sync errors', async () => {
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(users.syncRoleModulePermissions).toHaveBeenCalled();

    users.syncRoleModulePermissions.mockRejectedValueOnce(new Error('sync fail'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('demoLogin issues session when demo auth is enabled', async () => {
    const cfg = {
      get: jest.fn((key: string, def?: string) => {
        if (key === 'ENABLE_DEMO_AUTH') return 'true';
        if (key === 'jwt.expiration') return '15m';
        if (key === 'jwt.secret') return 'test-secret-at-least-32-chars-long!!';
        if (key === 'JWT_REFRESH_DAYS') return '7';
        if (key === 'app.environment') return 'test';
        return def;
      }),
    };
    const demoService = new AuthService(
      { sign: jest.fn().mockReturnValue('access') } as unknown as JwtService,
      cfg as unknown as ConfigService,
      users,
      { recordMutation: jest.fn(), recordAccess: jest.fn() } as any,
      {
        sendPasswordResetOtp: jest.fn(),
        sendLoginOtp: jest.fn(),
      } as unknown as AuthMailService,
      { emit: jest.fn() } as any,
      prisma as any,
      dispatcher as any,
      undefined,
    );

    users.findByRole.mockResolvedValue(user);
    users.createRefreshToken.mockResolvedValue(undefined as never);
    const session = await demoService.demoLogin('DOCTOR' as never);
    expect(session.accessToken).toBe('access');

    await expect(demoService.demoLogin('PATIENT' as never)).rejects.toThrow(
      /not available for PATIENT/,
    );
    users.findByRole.mockResolvedValue(null);
    await expect(demoService.demoLogin('NURSE' as never)).rejects.toThrow(
      /No demo account/,
    );
  });

  it('verifyLoginOtp validates challenge and issues session', async () => {
    users.findChallengeByHash.mockResolvedValue({
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    users.findById.mockResolvedValue(user);
    users.createRefreshToken.mockResolvedValue(undefined as never);

    // Wrong OTP format
    await expect(service.verifyLoginOtp('h'.repeat(40), '12')).rejects.toThrow(
      /6-digit/,
    );
    await expect(service.verifyLoginOtp('short', '123456')).rejects.toThrow(
      /Invalid verification challenge/,
    );

    // Expired challenge
    users.findChallengeByHash.mockResolvedValueOnce({
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    await expect(
      service.verifyLoginOtp('a'.repeat(40), '123456'),
    ).rejects.toThrow(/Invalid or expired/);
  });

  it('changePassword rejects identical new password', async () => {
    users.findById.mockResolvedValue(user);
    await expect(
      service.changePassword('u1', 'secret123', 'secret123'),
    ).rejects.toThrow(/must be different/);
  });

  it('validateAccessUser caches public user', async () => {
    users.findById.mockResolvedValue(user);
    const a = await service.validateAccessUser('u1');
    const b = await service.validateAccessUser('u1');
    expect(a?.email).toBe('a@test.com');
    expect(b?.email).toBe('a@test.com');
    expect(users.findById).toHaveBeenCalledTimes(1);

    users.findById.mockResolvedValue(null);
    expect(await service.validateAccessUser('missing')).toBeNull();
  });

  it('refresh rotates a valid token', async () => {
    users.findRefreshByHash.mockResolvedValue({
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    users.findById.mockResolvedValue(user);
    users.createRefreshToken.mockResolvedValue(undefined as never);
    const res = await service.refresh('refresh-token-value');
    expect(res.accessToken).toBe('access');
    expect(users.revokeRefreshByHash).toHaveBeenCalled();
  });

  it('security 2FA challenge requires OTP before enable; wrong OTP fails; confirm enables', async () => {
    users.findById.mockResolvedValue({ ...user, twoFactorEnabled: false });
    prisma.profiles.findFirst.mockResolvedValue({
      id: 'p1',
      user_id: 'u1',
      first_name: 'A',
      last_name: 'Test',
      phone: '+254712345678',
      profile_image: null,
      notification_sound_enabled: true,
      deleted_at: null,
    });

    const challenge = await service.startTwoFactorChallenge(
      'u1',
      'enable',
      'email',
    );
    expect(challenge.hash).toHaveLength(64);
    expect(challenge.channel).toBe('email');
    expect(users.updateTwoFactorEnabled).not.toHaveBeenCalled();
    expect(dispatcher.enqueueIntent).toHaveBeenCalled();

    const intent = dispatcher.enqueueIntent.mock.calls[0][0];
    const otp = intent.jobs[0].data.variables.otp as string;
    expect(otp).toMatch(/^\d{6}$/);
    const wrongOtp = otp === '000000' ? '111111' : '000000';

    users.findChallengeByHash.mockResolvedValue({
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.confirmTwoFactorChallenge('u1', {
        hash: challenge.hash,
        otp: wrongOtp,
        intent: 'enable',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.updateTwoFactorEnabled).not.toHaveBeenCalled();

    users.findChallengeByHash.mockResolvedValue({
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    users.updateTwoFactorEnabled.mockResolvedValue(undefined as never);
    users.findById
      .mockResolvedValueOnce({ ...user, twoFactorEnabled: false })
      .mockResolvedValueOnce({ ...user, twoFactorEnabled: false })
      .mockResolvedValueOnce({ ...user, twoFactorEnabled: true });

    const pub = await service.confirmTwoFactorChallenge('u1', {
      hash: challenge.hash,
      otp,
      intent: 'enable',
    });
    expect(users.updateTwoFactorEnabled).toHaveBeenCalledWith('u1', true);
    expect(pub.twoFactorEnabled).toBe(true);
    expect(users.revokeRefreshByHash).toHaveBeenCalledWith(challenge.hash);
  });

  it('updateMyProfile only updates the JWT user profile row', async () => {
    users.findById.mockResolvedValue(user);
    prisma.profiles.findFirst
      .mockResolvedValueOnce({
        id: 'p1',
        user_id: 'u1',
        first_name: 'A',
        last_name: 'Test',
        phone: null,
        profile_image: null,
        notification_sound_enabled: true,
        deleted_at: null,
      })
      .mockResolvedValueOnce({
        id: 'p1',
        user_id: 'u1',
        first_name: 'Ada',
        last_name: 'Test',
        phone: '+254700',
        profile_image: null,
        notification_sound_enabled: true,
        deleted_at: null,
      });
    prisma.profiles.update.mockResolvedValue({});

    const next = await service.updateMyProfile('u1', {
      firstName: 'Ada',
      phone: '+254700',
    });
    expect(prisma.profiles.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: 'u1' }),
      }),
    );
    expect(prisma.profiles.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          first_name: 'Ada',
          phone: '+254700',
        }),
      }),
    );
    expect(next.firstName).toBe('Ada');
    expect(next.phone).toBe('+254700');
  });
});
