/**
 * P0 AuthService full journey against Postgres :5433.
 * Covers login → me → refresh(rotate) → logout → reuse fail;
 * wrong password; unknown user; inactive user; 2FA; password reset OTP.
 */

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import type { PrismaClient } from '../../../generated/prisma';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import { AuthMailService } from '../auth-mail.service';
import { AuthService } from '../auth.service';
import { PrismaAuthUserRepository } from '../repositories/prisma-auth-user.repository';
import {
  asConnectedPrisma,
  cleanupAuthUser,
  createTestPrisma,
  seedAuthUser,
  type SeededUser,
} from './p0-test-helpers';

describe('P0 AuthService journeys (Postgres :5433)', () => {
  let prisma: PrismaClient;
  let auth: AuthService;
  let seeded: SeededUser;
  let lastOtp: string | undefined;
  let lastResetOtp: string | undefined;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    seeded = await seedAuthUser(prisma);

    const users = new PrismaAuthUserRepository(
      asConnectedPrisma(prisma) as never,
    );

    const jwt = new JwtService({
      secret:
        process.env.JWT_SECRET ||
        'nyalife-test-jwt-secret-do-not-use-in-prod-32',
      signOptions: { expiresIn: '15m' },
    });

    const config = {
      get: (key: string, def?: string) => {
        const map: Record<string, string> = {
          'jwt.expiration': '15m',
          'jwt.secret':
            process.env.JWT_SECRET ||
            'nyalife-test-jwt-secret-do-not-use-in-prod-32',
          JWT_REFRESH_DAYS: '7',
          JWT_SECRET:
            process.env.JWT_SECRET ||
            'nyalife-test-jwt-secret-do-not-use-in-prod-32',
          ENABLE_DEMO_AUTH: 'false',
          'app.environment': 'test',
        };
        return map[key] ?? process.env[key] ?? def;
      },
    } as unknown as ConfigService;

    const mail = {
      sendLoginOtp: jest.fn(async (input: { otp: string }) => {
        lastOtp = input.otp;
        return { delivered: false, mode: 'log' as const };
      }),
      sendPasswordResetOtp: jest.fn(async (input: { otp: string }) => {
        lastResetOtp = input.otp;
        return { delivered: false, mode: 'log' as const };
      }),
    } as unknown as AuthMailService;

    auth = new AuthService(
      jwt,
      config,
      users,
      {
        recordMutation: jest.fn().mockResolvedValue(undefined),
      } as unknown as HmsAuditWriter,
      mail,
      { emit: jest.fn() } as unknown as EventEmitter2,
    );
  });

  afterAll(async () => {
    await cleanupAuthUser(prisma, seeded.id);
    await prisma.$disconnect();
  });

  it('login → me → refresh rotates token → logout → reuse fails', async () => {
    const session = await auth.login(seeded.email, seeded.password, {
      ip: '127.0.0.1',
      userAgent: 'p0-journey',
    });
    expect('accessToken' in session).toBe(true);
    if (!('accessToken' in session)) return;

    expect(session.user.id).toBe(seeded.id);
    expect(session.user.id.startsWith('u-')).toBe(false);

    const me = await auth.me(seeded.id);
    expect(me.email).toBe(seeded.email);

    const rowCount = await prisma.refreshTokens.count({
      where: { user_id: seeded.id, revoked_at: null },
    });
    expect(rowCount).toBeGreaterThanOrEqual(1);

    const refreshed = await auth.refresh(session.refreshToken, {
      ip: '127.0.0.1',
    });
    expect(refreshed.accessToken).toBeTruthy();
    expect(refreshed.refreshToken).not.toBe(session.refreshToken);

    await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    await auth.logout(seeded.id, refreshed.refreshToken);
    await expect(auth.refresh(refreshed.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('wrong password does not issue tokens', async () => {
    const before = await prisma.refreshTokens.count({
      where: { user_id: seeded.id },
    });
    await expect(
      auth.login(seeded.email, 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const after = await prisma.refreshTokens.count({
      where: { user_id: seeded.id },
    });
    expect(after).toBe(before);
  });

  it('unknown email fails login', async () => {
    await expect(
      auth.login('nobody-p0@nyalife.test', 'nyalife123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('inactive user cannot login', async () => {
    const inactive = await seedAuthUser(prisma, { active: false });
    try {
      await expect(
        auth.login(inactive.email, inactive.password),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      await cleanupAuthUser(prisma, inactive.id);
    }
  });

  it('2FA: login returns challenge with UUID userId; verify OTP issues session', async () => {
    const u2 = await seedAuthUser(prisma, { twoFactor: true });
    lastOtp = undefined;
    try {
      const challenge = await auth.login(u2.email, u2.password);
      expect('twoFactorRequired' in challenge).toBe(true);
      if (!('twoFactorRequired' in challenge)) return;

      expect(lastOtp).toMatch(/^\d{6}$/);
      expect(challenge.hash.length).toBeGreaterThan(32);

      const challengeRow = await prisma.refreshTokens.findFirst({
        where: { token_hash: challenge.hash },
      });
      expect(challengeRow?.user_id).toBe(u2.id);

      const session = await auth.verifyLoginOtp(challenge.hash, lastOtp!, {
        ip: '127.0.0.1',
      });
      expect(session.accessToken).toBeTruthy();
      expect(session.user.id).toBe(u2.id);
    } finally {
      await cleanupAuthUser(prisma, u2.id);
    }
  });

  it('password reset: forgot → verify OTP → reset → old refresh invalid', async () => {
    const u = await seedAuthUser(prisma);
    lastResetOtp = undefined;
    try {
      const session = await auth.login(u.email, u.password);
      if (!('refreshToken' in session)) throw new Error('expected tokens');

      await auth.forgotPassword(u.email, { ip: '127.0.0.1' });
      expect(lastResetOtp).toMatch(/^\d{6}$/);

      const verified = await auth.verifyResetOtp(u.email, lastResetOtp!, {
        ip: '127.0.0.1',
      });
      expect(verified.resetToken).toBeTruthy();

      await auth.resetPassword(verified.resetToken, 'nyalife456', {
        ip: '127.0.0.1',
      });

      await expect(auth.refresh(session.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      const again = await auth.login(u.email, 'nyalife456');
      expect('accessToken' in again).toBe(true);
    } finally {
      await cleanupAuthUser(prisma, u.id);
    }
  });
});
