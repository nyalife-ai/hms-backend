/**
 * Shared helpers for P0 Postgres :5433 tests. Never touches production .env.
 */

import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../../../generated/prisma';

export type SeededUser = {
  id: string;
  email: string;
  password: string;
  roleName: string;
};

export async function createTestPrisma(): Promise<PrismaClient> {
  if (!process.env.DATABASE_URL?.includes('127.0.0.1:5433')) {
    throw new Error('P0 tests require DATABASE_URL on 127.0.0.1:5433');
  }
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
  await prisma.$connect();
  return prisma;
}

export async function seedAuthUser(
  prisma: PrismaClient,
  opts?: { roleName?: string; twoFactor?: boolean; active?: boolean },
): Promise<SeededUser> {
  const roleName = opts?.roleName ?? 'ADMIN';
  const password = 'nyalife123';
  const email = `p0-${randomUUID().slice(0, 8)}@nyalife.test`;

  const role =
    (await prisma.roles.findUnique({ where: { name: roleName } })) ??
    (await prisma.roles.create({
      data: { name: roleName, description: `P0 ${roleName}` },
    }));

  const user = await prisma.user.create({
    data: {
      email,
      password_hash: await bcrypt.hash(password, 10),
      is_active: opts?.active ?? true,
      two_factor_enabled: opts?.twoFactor ?? false,
      email_verified_at: new Date(),
    },
  });

  await prisma.profiles.create({
    data: {
      user_id: user.id,
      first_name: 'P0',
      last_name: roleName,
    },
  });
  await prisma.userRoles.create({
    data: { user_id: user.id, role_id: role.id },
  });

  return { id: user.id, email, password, roleName };
}

export async function cleanupAuthUser(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.refreshTokens.deleteMany({ where: { user_id: userId } });
  await prisma.userRoles.deleteMany({ where: { user_id: userId } });
  await prisma.profiles.deleteMany({ where: { user_id: userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function asConnectedPrisma(prisma: PrismaClient) {
  return Object.assign(prisma, { isConnected: true });
}
