/**
 * PrismaAuthUserRepository — memory fallback + Prisma-connected paths with mocks.
 */

import { createHash } from 'crypto';
import { AUTH_USERS } from '../auth.users';
import { PrismaAuthUserRepository } from '../repositories/prisma-auth-user.repository';

describe('PrismaAuthUserRepository', () => {
  const uuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  function makePrisma(connected: boolean) {
    const prisma: Record<string, any> = {
      isConnected: connected,
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
      refreshTokens: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      roles: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      permissions: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      rolePermissions: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      profiles: { create: jest.fn() },
      userRoles: { create: jest.fn() },
      patients: { count: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    };
    return prisma;
  }

  describe('memory fallback (DB disconnected)', () => {
    let prisma: Record<string, any>;
    let repo: PrismaAuthUserRepository;
    let admin: (typeof AUTH_USERS)[number];
    let savedHash: string;
    let saved2fa: boolean | undefined;

    beforeEach(() => {
      prisma = makePrisma(false);
      repo = new PrismaAuthUserRepository(prisma as never);
      admin = AUTH_USERS.find((u) => u.role === 'ADMIN')!;
      savedHash = admin.passwordHash;
      saved2fa = admin.twoFactorEnabled;
    });

    afterEach(() => {
      admin.passwordHash = savedHash;
      admin.twoFactorEnabled = saved2fa;
    });

    it('finds users by email, id, and role from AUTH_USERS', async () => {
      const byEmail = await repo.findByEmail(admin.email.toUpperCase());
      expect(byEmail?.id).toBe(admin.id);
      expect(byEmail?.permissions?.length).toBeGreaterThan(0);

      const byId = await repo.findById(admin.id);
      expect(byId?.email).toBe(admin.email);

      const byRole = await repo.findByRole('ADMIN');
      expect(byRole?.id).toBe(admin.id);

      expect(await repo.findByEmail('nobody@example.com')).toBeNull();
      expect(await repo.findById('missing')).toBeNull();
    });

    it('lists active memory users and mutates password / 2FA in memory', async () => {
      const listed = await repo.listActiveUsers();
      expect(listed.length).toBe(AUTH_USERS.length);

      await repo.touchLastLogin(admin.id);
      expect(prisma.user.update).not.toHaveBeenCalled();

      await repo.updatePasswordHash(admin.id, 'new-hash');
      expect(admin.passwordHash).toBe('new-hash');

      await repo.updateTwoFactorEnabled(admin.id, true);
      expect(admin.twoFactorEnabled).toBe(true);
    });

    it('stores and revokes refresh tokens in memory', async () => {
      const hash = createHash('sha256').update('tok').digest('hex');
      await repo.createRefreshToken({
        userId: admin.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: 'password-reset',
      });

      const found = await repo.findRefreshByHash(hash);
      expect(found?.userId).toBe(admin.id);

      const challenge = await repo.findChallengeByHash(hash, 'password-reset');
      expect(challenge?.userId).toBe(admin.id);
      expect(await repo.findChallengeByHash(hash, 'other')).toBeNull();

      await repo.revokeRefreshByHash(hash);
      expect((await repo.findRefreshByHash(hash))?.revokedAt).toBeInstanceOf(Date);

      const hash2 = createHash('sha256').update('tok2').digest('hex');
      await repo.createRefreshToken({
        userId: admin.id,
        tokenHash: hash2,
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: 'email-verify',
      });
      await repo.revokeAllForUser(admin.id);
      expect((await repo.findRefreshByHash(hash2))?.revokedAt).toBeInstanceOf(Date);

      const hash3 = createHash('sha256').update('tok3').digest('hex');
      await repo.createRefreshToken({
        userId: admin.id,
        tokenHash: hash3,
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: 'password-reset',
      });
      await repo.revokeUserChallenges(admin.id, ['password-reset']);
      expect((await repo.findRefreshByHash(hash3))?.revokedAt).toBeInstanceOf(Date);
    });

    it('rejects patient registration without DB and hashes tokens', async () => {
      await expect(
        repo.registerPatient({
          email: 'p@test.com',
          passwordHash: 'x',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(/Database required/);
      expect(repo.hashToken('abc')).toBe(
        createHash('sha256').update('abc').digest('hex'),
      );
      await repo.syncRoleModulePermissions();
    });
  });

  describe('Prisma-connected paths', () => {
    let prisma: Record<string, any>;
    let repo: PrismaAuthUserRepository;

    const dbUser = {
      id: uuid,
      email: 'doc@nyalife.test',
      password_hash: 'hash',
      two_factor_enabled: false,
      core_profiles_user_id: [{ first_name: 'Jane', last_name: 'Doe' }],
      core_staff_profiles_user_id: [
        { id: 'staff-1', position: 'Physician', specialization: 'GP' },
      ],
      core_user_roles_user_id: [
        {
          role: {
            name: 'DOCTOR',
            core_role_permissions_role_id: [
              { permission: { name: 'module:visits' } },
            ],
          },
        },
      ],
    };

    beforeEach(() => {
      prisma = makePrisma(true);
      repo = new PrismaAuthUserRepository(prisma as never);
    });

    it('maps DB users and returns null for non-UUID ids', async () => {
      prisma.user.findFirst.mockResolvedValue(dbUser);
      const mapped = await repo.findByEmail('doc@nyalife.test');
      expect(mapped).toMatchObject({
        id: uuid,
        role: 'DOCTOR',
        name: 'Dr. Jane Doe',
        staffProfileId: 'staff-1',
        permissions: ['module:visits'],
      });

      expect(await repo.findById('u-admin')).toBeNull();
      prisma.user.findFirst.mockResolvedValueOnce(null);
      expect(await repo.findById(uuid)).toBeNull();

      prisma.user.findFirst.mockResolvedValueOnce({
        ...dbUser,
        core_user_roles_user_id: [],
      });
      expect(await repo.findById(uuid)).toBeNull();

      prisma.user.findFirst.mockResolvedValueOnce({
        ...dbUser,
        core_profiles_user_id: [],
        core_staff_profiles_user_id: [],
        core_user_roles_user_id: [
          { role: { name: 'NURSE', core_role_permissions_role_id: [] } },
        ],
      });
      const nurse = await repo.findById(uuid);
      expect(nurse?.name).toBe('doc@nyalife.test');
      expect(nurse?.permissions?.length).toBeGreaterThan(0);
    });

    it('lists DB users and finds by role', async () => {
      prisma.user.findMany.mockResolvedValue([dbUser]);
      const listed = await repo.listActiveUsers();
      expect(listed).toHaveLength(1);

      prisma.user.findFirst.mockResolvedValue(dbUser);
      expect((await repo.findByRole('DOCTOR'))?.id).toBe(uuid);
    });

    it('updates login, password, and 2FA via Prisma', async () => {
      await repo.touchLastLogin(uuid);
      expect(prisma.user.update).toHaveBeenCalled();

      prisma.user.update.mockRejectedValueOnce(new Error('gone'));
      await expect(repo.touchLastLogin(uuid)).resolves.toBeUndefined();

      await repo.updatePasswordHash(uuid, 'next');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { password_hash: 'next' },
        }),
      );
      await repo.updateTwoFactorEnabled(uuid, true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { two_factor_enabled: true },
        }),
      );
    });

    it('persists refresh tokens only for UUID users', async () => {
      await repo.createRefreshToken({
        userId: uuid,
        tokenHash: 'h1',
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: 'ua',
        ip: '127.0.0.1',
      });
      expect(prisma.refreshTokens.create).toHaveBeenCalled();

      await repo.createRefreshToken({
        userId: 'u-admin',
        tokenHash: 'h-mem',
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(prisma.refreshTokens.create).toHaveBeenCalledTimes(1);
      expect(await repo.findRefreshByHash('h-mem')).toMatchObject({
        userId: 'u-admin',
      });

      prisma.refreshTokens.findUnique.mockResolvedValue({
        user_id: uuid,
        expires_at: new Date(),
        revoked_at: null,
      });
      expect((await repo.findRefreshByHash('h1'))?.userId).toBe(uuid);

      await repo.revokeRefreshByHash('h1');
      await repo.revokeAllForUser(uuid);
      await repo.revokeUserChallenges(uuid, []);
      await repo.revokeUserChallenges(uuid, ['password-reset']);
      expect(prisma.refreshTokens.updateMany).toHaveBeenCalled();

      prisma.refreshTokens.findFirst.mockResolvedValue({
        user_id: uuid,
        expires_at: new Date(),
        revoked_at: null,
      });
      expect(
        (await repo.findPasswordResetByHash('reset-hash'))?.userId,
      ).toBe(uuid);
    });

    it('registers patients inside a transaction', async () => {
      const tx = {
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: uuid }),
        },
        roles: {
          findUnique: jest.fn().mockResolvedValue({ id: 'role-patient' }),
        },
        patients: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({ id: 'pat-1' }),
        },
        profiles: { create: jest.fn().mockResolvedValue({}) },
        userRoles: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
        fn(tx),
      );

      const result = await repo.registerPatient({
        email: 'New@Patient.test',
        passwordHash: 'ph',
        firstName: 'Pat',
        lastName: 'Ient',
        phone: '0700',
        gender: 'FEMALE',
        dateOfBirth: '1990-01-01',
      });
      expect(result).toEqual({
        userId: uuid,
        patientId: 'pat-1',
        mrn: 'MRN-10001',
      });

      tx.user.findFirst.mockResolvedValueOnce({ id: 'existing' });
      await expect(
        repo.registerPatient({
          email: 'x@y.com',
          passwordHash: 'ph',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(/already registered/);

      tx.user.findFirst.mockResolvedValueOnce(null);
      tx.roles.findUnique.mockResolvedValueOnce(null);
      await expect(
        repo.registerPatient({
          email: 'z@y.com',
          passwordHash: 'ph',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(/PATIENT role/);
    });

    it('syncs role module permissions', async () => {
      prisma.roles.findMany.mockResolvedValue([
        { id: 'r-admin', name: 'ADMIN' },
      ]);
      prisma.permissions.findMany.mockResolvedValue([
        { id: 'p-visits', name: 'module:visits' },
        { id: 'p-billing', name: 'module:billing' },
        { id: 'p-account', name: 'module:account' },
      ]);
      await repo.syncRoleModulePermissions();
      expect(prisma.permissions.upsert).toHaveBeenCalled();
      expect(
        prisma.permissions.upsert.mock.calls.some(
          (c: unknown[]) =>
            (c[0] as { where: { name: string } }).where.name ===
            'module:account',
        ),
      ).toBe(true);
      expect(prisma.rolePermissions.upsert).toHaveBeenCalled();
      expect(prisma.rolePermissions.deleteMany).toHaveBeenCalled();
    });
  });
});
