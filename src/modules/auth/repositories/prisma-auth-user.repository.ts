/**
 * Prisma + memory fallback auth repository.
 */

import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AUTH_USERS } from '../auth.users';
import {
  modulePermission,
  ROLE_MODULE_ACCESS,
} from '../auth.permissions';
import type { AuthUser, HmsRole } from '../auth.types';
import type {
  IAuthUserRepository,
  RefreshTokenRecord,
} from './auth-user.repository.interface';

interface MemoryRefresh {
  userId: string;
  expiresAt: Date;
  revokedAt?: Date;
}

@Injectable()
export class PrismaAuthUserRepository implements IAuthUserRepository {
  private readonly memoryRefresh = new Map<string, MemoryRefresh>();

  public constructor(private readonly prisma: PrismaService) {}

  public async findByEmail(email: string): Promise<AuthUser | null> {
    if (this.prisma.isConnected) {
      try {
        const row = await this.prisma.user.findFirst({
          where: {
            email: { equals: email, mode: 'insensitive' },
            deleted_at: null,
            is_active: true,
          },
          include: this.userInclude(),
        });
        return this.mapDbUser(row);
      } catch {
        const mem = AUTH_USERS.find(
          (u) => u.email.toLowerCase() === email.toLowerCase(),
        );
        return mem ? this.withFallbackPermissions(mem) : null;
      }
    }
    const mem = AUTH_USERS.find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
    return mem ? this.withFallbackPermissions(mem) : null;
  }

  public async findById(id: string): Promise<AuthUser | null> {
    if (this.prisma.isConnected) {
      const row = await this.prisma.user.findFirst({
        where: { id, deleted_at: null, is_active: true },
        include: this.userInclude(),
      });
      return this.mapDbUser(row);
    }
    const mem = AUTH_USERS.find((u) => u.id === id);
    return mem ? this.withFallbackPermissions(mem) : null;
  }

  public async findByRole(role: HmsRole): Promise<AuthUser | null> {
    if (this.prisma.isConnected) {
      const row = await this.prisma.user.findFirst({
        where: {
          deleted_at: null,
          is_active: true,
          core_user_roles_user_id: { some: { role: { name: role } } },
        },
        include: this.userInclude(),
      });
      return this.mapDbUser(row);
    }
    const mem = AUTH_USERS.find((u) => u.role === role);
    return mem ? this.withFallbackPermissions(mem) : null;
  }

  public async listActiveUsers(): Promise<AuthUser[]> {
    if (this.prisma.isConnected) {
      const rows = await this.prisma.user.findMany({
        where: { deleted_at: null, is_active: true },
        include: this.userInclude(),
        orderBy: { email: 'asc' },
        take: 200,
      });
      return rows
        .map((row) => this.mapDbUser(row))
        .filter((u): u is AuthUser => Boolean(u));
    }
    return AUTH_USERS.map((u) => this.withFallbackPermissions(u));
  }

  public async touchLastLogin(userId: string): Promise<void> {
    if (!this.prisma.isConnected) return;
    await this.prisma.user
      .update({
        where: { id: userId },
        data: { last_login: new Date() },
      })
      .catch(() => undefined);
  }

  public async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    if (this.prisma.isConnected) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { password_hash: passwordHash },
      });
      return;
    }
    const mem = AUTH_USERS.find((u) => u.id === userId);
    if (mem) mem.passwordHash = passwordHash;
  }

  public async createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }): Promise<void> {
    if (this.prisma.isConnected) {
      await this.prisma.refreshTokens.create({
        data: {
          user_id: input.userId,
          token_hash: input.tokenHash,
          expires_at: input.expiresAt,
          user_agent: input.userAgent?.slice(0, 500) ?? null,
          ip_address: input.ip?.slice(0, 45) ?? null,
        },
      });
      return;
    }
    this.memoryRefresh.set(input.tokenHash, {
      userId: input.userId,
      expiresAt: input.expiresAt,
    });
  }

  public async findRefreshByHash(
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null> {
    if (this.prisma.isConnected) {
      const row = await this.prisma.refreshTokens.findUnique({
        where: { token_hash: tokenHash },
      });
      if (!row) return null;
      return {
        userId: row.user_id,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      };
    }
    const mem = this.memoryRefresh.get(tokenHash);
    if (!mem) return null;
    return {
      userId: mem.userId,
      expiresAt: mem.expiresAt,
      revokedAt: mem.revokedAt,
    };
  }

  public async revokeRefreshByHash(tokenHash: string): Promise<void> {
    if (this.prisma.isConnected) {
      await this.prisma.refreshTokens
        .updateMany({
          where: { token_hash: tokenHash, revoked_at: null },
          data: { revoked_at: new Date() },
        })
        .catch(() => undefined);
      return;
    }
    const mem = this.memoryRefresh.get(tokenHash);
    if (mem) mem.revokedAt = new Date();
  }

  public async revokeAllForUser(userId: string): Promise<void> {
    if (this.prisma.isConnected) {
      await this.prisma.refreshTokens
        .updateMany({
          where: { user_id: userId, revoked_at: null },
          data: { revoked_at: new Date() },
        })
        .catch(() => undefined);
      return;
    }
    for (const [hash, row] of this.memoryRefresh) {
      if (row.userId === userId) {
        row.revokedAt = new Date();
        this.memoryRefresh.set(hash, row);
      }
    }
  }

  public async registerPatient(input: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
    gender?: 'MALE' | 'FEMALE' | 'OTHER';
    dateOfBirth?: string;
  }): Promise<{ userId: string; patientId: string; mrn: string }> {
    if (!this.prisma.isConnected) {
      throw new Error('Database required for patient registration');
    }
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { email: { equals: input.email, mode: 'insensitive' } },
      });
      if (existing) {
        throw new Error('Email already registered');
      }
      const role = await tx.roles.findUnique({ where: { name: 'PATIENT' } });
      if (!role) {
        throw new Error('PATIENT role is not seeded');
      }
      const count = await tx.patients.count();
      const mrn = `MRN-${String(10000 + count + 1).padStart(5, '0')}`;
      const user = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          password_hash: input.passwordHash,
          is_active: true,
          email_verified_at: new Date(),
        },
      });
      await tx.profiles.create({
        data: {
          user_id: user.id,
          first_name: input.firstName,
          last_name: input.lastName,
          phone: input.phone,
          gender: input.gender,
          date_of_birth: input.dateOfBirth
            ? new Date(input.dateOfBirth)
            : undefined,
        },
      });
      await tx.userRoles.create({
        data: { user_id: user.id, role_id: role.id },
      });
      const patient = await tx.patients.create({
        data: {
          user_id: user.id,
          patient_number: mrn,
        },
      });
      return { userId: user.id, patientId: patient.id, mrn };
    });
  }

  public async findPasswordResetByHash(
    tokenHash: string,
  ): Promise<{ userId: string; expiresAt: Date; revokedAt?: Date | null } | null> {
    if (this.prisma.isConnected) {
      const row = await this.prisma.refreshTokens.findFirst({
        where: {
          token_hash: tokenHash,
          user_agent: 'password-reset',
        },
      });
      if (!row) return null;
      return {
        userId: row.user_id,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      };
    }
    return null;
  }

  public async syncRoleModulePermissions(): Promise<void> {
    if (!this.prisma.isConnected) return;

    const roles = await this.prisma.roles.findMany();
    const permissions = await this.prisma.permissions.findMany();
    const roleByName = Object.fromEntries(roles.map((r) => [r.name, r]));
    const permissionByName = Object.fromEntries(
      permissions.map((p) => [p.name, p]),
    );

    for (const [roleName, modules] of Object.entries(ROLE_MODULE_ACCESS)) {
      const role = roleByName[roleName];
      if (!role) continue;

      const allowedIds = new Set<string>();
      for (const module of modules) {
        const permission = permissionByName[modulePermission(module)];
        if (!permission) continue;
        allowedIds.add(permission.id);
        await this.prisma.rolePermissions.upsert({
          where: {
            role_id_permission_id: {
              role_id: role.id,
              permission_id: permission.id,
            },
          },
          create: {
            role_id: role.id,
            permission_id: permission.id,
          },
          update: {},
        });
      }

      if (allowedIds.size === 0) continue;
      await this.prisma.rolePermissions.deleteMany({
        where: {
          role_id: role.id,
          permission_id: { notIn: [...allowedIds] },
        },
      });
    }
  }

  /** Exposed for AuthService hashing helpers that still live in service. */
  public hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private userInclude() {
    return {
      core_profiles_user_id: true,
      core_staff_profiles_user_id: true,
      core_user_roles_user_id: {
        include: {
          role: {
            include: {
              core_role_permissions_role_id: {
                include: { permission: true },
              },
            },
          },
        },
      },
    } as const;
  }

  private withFallbackPermissions(
    user: Omit<AuthUser, 'permissions'> & { permissions?: string[] },
  ): AuthUser {
    const modules = ROLE_MODULE_ACCESS[user.role] ?? [];
    return {
      ...user,
      permissions: modules.map(modulePermission),
    };
  }

  private mapDbUser(
    row: {
      id: string;
      email: string;
      password_hash: string | null;
      core_profiles_user_id: { first_name: string; last_name: string }[];
      core_staff_profiles_user_id: {
        position: string | null;
        specialization: string | null;
      }[];
      core_user_roles_user_id: {
        role: {
          name: string;
          core_role_permissions_role_id?: {
            permission: { name: string };
          }[];
        };
      }[];
    } | null,
  ): AuthUser | null {
    if (!row) return null;
    const roleName = row.core_user_roles_user_id[0]?.role.name as
      | HmsRole
      | undefined;
    if (!roleName) return null;

    const fromDb = new Set<string>();
    for (const ur of row.core_user_roles_user_id) {
      for (const rp of ur.role.core_role_permissions_role_id ?? []) {
        fromDb.add(rp.permission.name);
      }
    }
    const permissions =
      fromDb.size > 0
        ? [...fromDb]
        : (ROLE_MODULE_ACCESS[roleName] ?? []).map(modulePermission);

    const profile = row.core_profiles_user_id[0];
    const staff = row.core_staff_profiles_user_id[0];
    const displayName =
      profile &&
      (roleName === 'DOCTOR' || roleName === 'RADIOLOGIST') &&
      !profile.first_name.startsWith('Dr')
        ? `Dr. ${profile.first_name} ${profile.last_name}`
        : profile
          ? `${profile.first_name} ${profile.last_name}`
          : row.email;

    return {
      id: row.id,
      email: row.email,
      name: displayName,
      role: roleName,
      position: staff?.position ?? roleName,
      passwordHash: row.password_hash ?? '',
      permissions,
    };
  }
}
