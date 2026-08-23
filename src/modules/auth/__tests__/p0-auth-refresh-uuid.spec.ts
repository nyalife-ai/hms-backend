/**
 * P0 auth regression — refresh token UUID + login journey against Postgres :5433.
 */

import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../../../generated/prisma';
import { AUTH_USERS } from '../auth.users';
import { PrismaAuthUserRepository } from '../repositories/prisma-auth-user.repository';

describe('P0 auth refresh-token UUID regression (Postgres :5433)', () => {
  let prisma: PrismaClient;
  let users: PrismaAuthUserRepository;

  const email = `p0-auth-${randomUUID().slice(0, 8)}@nyalife.test`;
  const password = 'nyalife123';
  let userId = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('127.0.0.1:5433')) {
      throw new Error('P0 auth tests require DATABASE_URL on 127.0.0.1:5433');
    }
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await prisma.$connect();

    const role =
      (await prisma.roles.findUnique({ where: { name: 'ADMIN' } })) ??
      (await prisma.roles.create({
        data: { name: 'ADMIN', description: 'P0 test admin' },
      }));

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password_hash: hash,
        is_active: true,
        email_verified_at: new Date(),
      },
    });
    userId = user.id;
    await prisma.profiles.create({
      data: {
        user_id: user.id,
        first_name: 'P0',
        last_name: 'Auth',
      },
    });
    await prisma.userRoles.create({
      data: { user_id: user.id, role_id: role.id },
    });

    const prismaSvc = Object.assign(prisma, { isConnected: true });
    users = new PrismaAuthUserRepository(prismaSvc as never);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.refreshTokens.deleteMany({ where: { user_id: userId } });
      await prisma.userRoles.deleteMany({ where: { user_id: userId } });
      await prisma.profiles.deleteMany({ where: { user_id: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('rejects invalid UUID user_id at Prisma (reproduces production error)', async () => {
    await expect(
      prisma.refreshTokens.create({
        data: {
          user_id: 'u-admin',
          token_hash: createHash('sha256').update('x').digest('hex'),
          expires_at: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow(/UUID|invalid character|Inconsistent column data/i);
  });

  it('never writes demo AUTH_USERS ids (u-*) into refresh_tokens when DB connected', async () => {
    const demo = AUTH_USERS.find((u) => u.id.startsWith('u-'));
    expect(demo).toBeDefined();

    await users.createRefreshToken({
      userId: demo!.id,
      tokenHash: createHash('sha256')
        .update(`demo-${Date.now()}`)
        .digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: 'p0-test-demo',
    });

    const rows = await prisma.refreshTokens.findMany({
      where: { user_agent: 'p0-test-demo' },
    });
    expect(rows).toHaveLength(0);
  });

  it('persists refresh token for a real UUID user', async () => {
    const tokenHash = createHash('sha256')
      .update(`ok-${randomUUID()}`)
      .digest('hex');
    await users.createRefreshToken({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: 'p0-valid',
      ip: '127.0.0.1',
    });

    const row = await prisma.refreshTokens.findUnique({
      where: { token_hash: tokenHash },
    });
    expect(row).not.toBeNull();
    expect(row!.user_id).toBe(userId);
    expect(row!.revoked_at).toBeNull();
  });

  it('findByEmail returns DB UUID user, not demo u-* fallback', async () => {
    const found = await users.findByEmail(email);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(userId);
    expect(found!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(found!.id.startsWith('u-')).toBe(false);
  });

  it('findById rejects non-UUID ids when DB connected', async () => {
    expect(await users.findById('u-admin')).toBeNull();
    expect(await users.findById('undefined')).toBeNull();
    expect(await users.findById('')).toBeNull();
    expect(await users.findById('not-a-uuid')).toBeNull();
  });

  it('createRefreshToken never writes malformed / undefined / null-like userIds to Prisma', async () => {
    const before = await prisma.refreshTokens.count();
    const badIds = [
      'u-admin',
      'undefined',
      'null',
      '',
      '12345',
      'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    ];
    for (const bad of badIds) {
      await users.createRefreshToken({
        userId: bad,
        tokenHash: createHash('sha256').update(`bad-${bad}-${Date.now()}`).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: 'p0-bad-uuid',
      });
    }
    const after = await prisma.refreshTokens.count();
    expect(after).toBe(before);
    const leaked = await prisma.refreshTokens.findMany({
      where: { user_agent: 'p0-bad-uuid' },
    });
    expect(leaked).toHaveLength(0);
  });

  it('login-shaped journey: verify password → create refresh → revoke → revokedAt set', async () => {
    const found = await users.findByEmail(email);
    expect(found).not.toBeNull();

    const ok = await bcrypt.compare(password, found!.passwordHash);
    expect(ok).toBe(true);

    const tokenHash = createHash('sha256')
      .update(`journey-${randomUUID()}`)
      .digest('hex');
    await users.createRefreshToken({
      userId: found!.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 86_400_000),
      userAgent: 'p0-journey',
    });

    const stored = await users.findRefreshByHash(tokenHash);
    expect(stored?.userId).toBe(found!.id);
    expect(stored?.revokedAt).toBeFalsy();

    await users.revokeRefreshByHash(tokenHash);
    const after = await users.findRefreshByHash(tokenHash);
    expect(after?.revokedAt).toBeInstanceOf(Date);
  });

  it('wrong password does not create refresh tokens', async () => {
    const before = await prisma.refreshTokens.count({
      where: { user_id: userId },
    });
    const found = await users.findByEmail(email);
    const ok = await bcrypt.compare('wrong-password', found!.passwordHash);
    expect(ok).toBe(false);
    const after = await prisma.refreshTokens.count({
      where: { user_id: userId },
    });
    expect(after).toBe(before);
  });
});
