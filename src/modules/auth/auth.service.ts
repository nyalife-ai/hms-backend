/**
 * Auth application service — sessions/tokens; persistence via IAuthUserRepository.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { HmsAuditWriter } from '../audit/hms-audit.writer';
import type {
  AuthTokens,
  AuthUser,
  AuthUserPublic,
  HmsRole,
  JwtPayload,
} from './auth.types';
import type { AuthResponseDto } from './dto/login.dto';
import {
  AUTH_USER_REPOSITORY,
  type IAuthUserRepository,
} from './repositories/auth-user.repository.interface';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  /** Short cache so every authenticated request does not hit the DB. */
  private readonly accessUserCache = new Map<
    string,
    { user: AuthUserPublic; expiresAt: number }
  >();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(AUTH_USER_REPOSITORY)
    private readonly users: IAuthUserRepository,
    private readonly audit: HmsAuditWriter,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.users.syncRoleModulePermissions();
      this.logger.log('Synced role module permissions from ROLE_MODULE_ACCESS');
    } catch (err) {
      this.logger.warn(
        `Role permission sync skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  isDemoAuthEnabled(): boolean {
    const flag = this.config.get<string>('ENABLE_DEMO_AUTH');
    if (flag === 'true' || flag === '1') return true;
    if (flag === 'false' || flag === '0') return false;
    const env =
      this.config.get<string>('app.environment') ||
      process.env.NODE_ENV ||
      'development';
    return env !== 'production';
  }

  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(email);
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.users.touchLastLogin(user.id);
    const session = await this.issueSession(user, meta);
    await this.audit.recordMutation({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'auth.session',
      entityId: user.id,
      newValues: { event: 'LOGIN' },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return session;
  }

  async registerPatient(
    input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
      gender?: 'MALE' | 'FEMALE' | 'OTHER';
      dateOfBirth?: string;
    },
    meta?: { userAgent?: string; ip?: string },
  ): Promise<AuthResponseDto> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    let registered: { userId: string; patientId: string; mrn: string };
    try {
      registered = await this.users.registerPatient({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      if (message.includes('already registered')) {
        throw new ConflictException('Email already registered');
      }
      if (
        message.includes('Database required') ||
        message.includes('not seeded')
      ) {
        throw new ServiceUnavailableException(message);
      }
      throw new BadRequestException(message);
    }
    await this.audit.recordMutation({
      userId: registered.userId,
      action: 'CREATE',
      entityType: 'patients.patients',
      entityId: registered.patientId,
      newValues: { mrn: registered.mrn, email: input.email.toLowerCase() },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
    const user = await this.users.findById(registered.userId);
    if (!user) {
      throw new ServiceUnavailableException(
        'Registration succeeded but login failed',
      );
    }
    return this.issueSession(user, meta);
  }

  async forgotPassword(
    email: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ ok: true; resetToken?: string; expiresInMinutes: number }> {
    const expiresInMinutes = 60;
    const generic = { ok: true as const, expiresInMinutes };
    const user = await this.users.findByEmail(email);
    if (!user) {
      return generic;
    }
    const resetToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(resetToken);
    await this.users.createRefreshToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000),
      userAgent: 'password-reset',
      ip: meta?.ip,
    });
    await this.audit.recordMutation({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'auth.password_reset',
      entityId: user.id,
      newValues: { event: 'FORGOT_REQUESTED' },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
    const env =
      this.config.get<string>('app.environment') ||
      process.env.NODE_ENV ||
      'development';
    if (env === 'production') {
      return generic;
    }
    return { ...generic, resetToken };
  }

  async resetPassword(
    resetToken: string,
    newPassword: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ ok: true }> {
    const hash = this.hashToken(resetToken);
    const record = await this.users.findPasswordResetByHash(hash);
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.updatePasswordHash(record.userId, passwordHash);
    await this.users.revokeRefreshByHash(hash);
    await this.users.revokeAllForUser(record.userId);
    await this.audit.recordMutation({
      userId: record.userId,
      action: 'UPDATE',
      entityType: 'auth.password',
      entityId: record.userId,
      newValues: { event: 'PASSWORD_RESET' },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return { ok: true };
  }

  async demoLogin(
    role: HmsRole,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<AuthResponseDto> {
    if (!this.isDemoAuthEnabled()) {
      throw new ForbiddenException('Demo login is disabled');
    }
    if (role === 'PATIENT') {
      throw new ForbiddenException('Demo login is not available for PATIENT');
    }
    const user = await this.users.findByRole(role);
    if (!user) {
      throw new UnauthorizedException(`No demo account for role ${role}`);
    }
    return this.issueSession(user, meta);
  }

  async refresh(
    refreshToken: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<AuthResponseDto> {
    const hash = this.hashToken(refreshToken);
    const record = await this.users.findRefreshByHash(hash);
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.users.findById(record.userId);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('User not found or inactive');
    }

    await this.users.revokeRefreshByHash(hash);
    return this.issueSession(user, meta);
  }

  async logout(userId: string, refreshToken?: string): Promise<{ ok: true }> {
    if (refreshToken) {
      await this.users.revokeRefreshByHash(this.hashToken(refreshToken));
    } else {
      await this.users.revokeAllForUser(userId);
    }
    await this.audit.recordMutation({
      userId,
      action: 'UPDATE',
      entityType: 'auth.session',
      entityId: userId,
      newValues: { event: 'LOGOUT' },
    });
    return { ok: true };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    this.accessUserCache.delete(userId);
    const user = await this.users.findById(userId);
    if (!user?.passwordHash) {
      throw new UnauthorizedException('User not found');
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new ForbiddenException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.updatePasswordHash(userId, passwordHash);
    await this.users.revokeAllForUser(userId);
    await this.audit.recordMutation({
      userId,
      action: 'UPDATE',
      entityType: 'auth.password',
      entityId: userId,
      newValues: { event: 'PASSWORD_CHANGED' },
    });
    return { ok: true };
  }

  async me(userId: string): Promise<AuthUserPublic> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toPublic(user);
  }

  async validateAccessUser(userId: string): Promise<AuthUserPublic | null> {
    const cached = this.accessUserCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }
    const user = await this.users.findById(userId);
    if (!user) {
      this.accessUserCache.delete(userId);
      return null;
    }
    const pub = this.toPublic(user);
    this.accessUserCache.set(userId, {
      user: pub,
      expiresAt: Date.now() + 30_000,
    });
    return pub;
  }

  async listDemoAccounts(): Promise<AuthUserPublic[]> {
    if (!this.isDemoAuthEnabled()) {
      return [];
    }
    const users = await this.users.listActiveUsers();
    return users
      .filter((u) => u.role !== 'PATIENT')
      .map((u) => this.toPublic(u));
  }

  private async issueSession(
    user: AuthUser,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<AuthResponseDto> {
    const tokens = await this.issueTokens(user, meta);
    return {
      ...tokens,
      user: this.toPublic(user),
    };
  }

  private async issueTokens(
    user: AuthUser,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<AuthTokens> {
    const expiresIn = this.config.get<string>('jwt.expiration', '15m');
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      position: user.position,
      permissions: user.permissions,
    };
    const accessToken = this.jwt.sign(payload, {
      expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(refreshToken);
    const refreshDays = parseInt(
      this.config.get<string>('JWT_REFRESH_DAYS', '7') || '7',
      10,
    );
    const expiresAt = new Date(
      Date.now() + Math.max(1, refreshDays) * 24 * 60 * 60 * 1000,
    );

    await this.users.createRefreshToken({
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: meta?.userAgent,
      ip: meta?.ip,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublic(user: AuthUser): AuthUserPublic {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      position: user.position,
      permissions: user.permissions,
    };
  }
}
