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
import { createHash, createHmac, randomBytes, randomInt } from 'crypto';
import { HmsAuditWriter } from '../audit/hms-audit.writer';
import { AuthMailService } from './auth-mail.service';
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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createDomainEventEnvelope } from '../notifications/infrastructure/domain-event.envelope';
import { DOMAIN_EVENT_TYPES } from '../notifications/policy/notification-policy.service';

const OTP_UA = 'password-reset-otp';
const RESET_UA = 'password-reset';
const LOGIN_2FA_UA = 'login-2fa-otp';
const OTP_TTL_MINUTES = 10;
const RESET_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
const FORGOT_MAX_PER_EMAIL = 3;
const FORGOT_WINDOW_MS = 15 * 60_000;

export type LoginResult =
  | AuthResponseDto
  | {
      twoFactorRequired: true;
      hash: string;
      expiresInMinutes: number;
      message: string;
    };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  /** Short cache so every authenticated request does not hit the DB. */
  private readonly accessUserCache = new Map<
    string,
    { user: AuthUserPublic; expiresAt: number }
  >();

  /** In-memory OTP attempt counters (per user). */
  private readonly otpAttempts = new Map<
    string,
    { count: number; windowStarted: number }
  >();

  /** In-memory forgot-password rate limits (per email + per IP). */
  private readonly forgotHits = new Map<string, number[]>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(AUTH_USER_REPOSITORY)
    private readonly users: IAuthUserRepository,
    private readonly audit: HmsAuditWriter,
    private readonly mail: AuthMailService,
    private readonly events: EventEmitter2,
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
  ): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    if (!user?.passwordHash) {
      this.emitAuthEvent(DOMAIN_EVENT_TYPES.AUTH_LOGIN_FAILED, {
        email,
        reason: 'unknown_user',
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      this.emitAuthEvent(DOMAIN_EVENT_TYPES.AUTH_LOGIN_FAILED, {
        userId: user.id,
        reason: 'bad_password',
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.twoFactorEnabled) {
      await this.users.revokeUserChallenges(user.id, [LOGIN_2FA_UA]);
      this.otpAttempts.delete(user.id);

      const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const otpHash = this.hashOtp(user.id, otp);
      await this.users.createRefreshToken({
        userId: user.id,
        tokenHash: otpHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
        userAgent: LOGIN_2FA_UA,
        ip: meta?.ip,
      });

      await this.mail.sendLoginOtp({
        to: user.email,
        otp,
        expiresInMinutes: OTP_TTL_MINUTES,
      });

      await this.audit.recordMutation({
        userId: user.id,
        action: 'UPDATE',
        entityType: 'auth.session',
        entityId: user.id,
        newValues: { event: 'LOGIN_2FA_CHALLENGE' },
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      });

      return {
        twoFactorRequired: true,
        hash: otpHash,
        expiresInMinutes: OTP_TTL_MINUTES,
        message: 'Enter the verification code sent to your email.',
      };
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
    this.emitAuthEvent(DOMAIN_EVENT_TYPES.AUTH_LOGIN_SUCCESS, {
      userId: user.id,
    });
    return session;
  }

  /**
   * Complete login when 2FA is enabled — verifies email OTP against challenge hash.
   */
  async verifyLoginOtp(
    hash: string,
    otp: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<AuthResponseDto> {
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Enter the 6-digit code from your email');
    }
    const challengeHash = hash.trim();
    if (!challengeHash || challengeHash.length < 32) {
      throw new BadRequestException('Invalid verification challenge');
    }

    const record = await this.users.findChallengeByHash(
      challengeHash,
      LOGIN_2FA_UA,
    );
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const attempts = this.otpAttempts.get(record.userId);
    if (attempts && attempts.count >= OTP_MAX_ATTEMPTS) {
      if (Date.now() - attempts.windowStarted < FORGOT_WINDOW_MS) {
        throw new UnauthorizedException(
          'Too many incorrect codes. Sign in again to request a new code.',
        );
      }
      this.otpAttempts.delete(record.userId);
    }

    const expected = this.hashOtp(record.userId, code);
    if (expected !== challengeHash) {
      this.bumpOtpAttempt(record.userId);
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const user = await this.users.findById(record.userId);
    if (!user?.passwordHash) {
      throw new UnauthorizedException('User not found or inactive');
    }

    await this.users.revokeRefreshByHash(challengeHash);
    this.otpAttempts.delete(user.id);
    await this.users.touchLastLogin(user.id);
    const session = await this.issueSession(user, meta);
    await this.audit.recordMutation({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'auth.session',
      entityId: user.id,
      newValues: { event: 'LOGIN_2FA_VERIFIED' },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return session;
  }

  async setTwoFactorEnabled(
    userId: string,
    enabled: boolean,
  ): Promise<AuthUserPublic> {
    this.accessUserCache.delete(userId);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    await this.users.updateTwoFactorEnabled(userId, enabled);
    if (!enabled) {
      await this.users.revokeUserChallenges(userId, [LOGIN_2FA_UA]);
    }
    await this.audit.recordMutation({
      userId,
      action: 'UPDATE',
      entityType: 'auth.two_factor',
      entityId: userId,
      newValues: { enabled },
    });
    this.emitAuthEvent(DOMAIN_EVENT_TYPES.AUTH_ACCOUNT_SECURITY_CHANGED, {
      userId,
      twoFactorEnabled: enabled,
    });
    const refreshed = await this.users.findById(userId);
    if (!refreshed) {
      throw new UnauthorizedException('User not found');
    }
    return this.toPublic(refreshed);
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

  /**
   * Step 1 — request OTP. Always returns a generic success payload
   * (no email enumeration). OTP is hashed at rest; plaintext is emailed
   * (or logged in dev when SMTP is absent).
   */
  async forgotPassword(
    email: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{
    ok: true;
    expiresInMinutes: number;
    message: string;
  }> {
    const normalized = email.trim().toLowerCase();
    const message =
      'If an account exists for that email, a one-time code has been sent.';
    const generic = {
      ok: true as const,
      expiresInMinutes: OTP_TTL_MINUTES,
      message,
    };

    this.assertForgotRateLimit(`email:${normalized}`);
    if (meta?.ip) this.assertForgotRateLimit(`ip:${meta.ip}`);

    const user = await this.users.findByEmail(normalized);
    if (!user) {
      // Constant-ish delay to reduce timing oracle
      await this.sleep(80 + randomInt(40));
      return generic;
    }

    await this.users.revokeUserChallenges(user.id, [OTP_UA, RESET_UA]);
    this.otpAttempts.delete(user.id);

    const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otpHash = this.hashOtp(user.id, otp);
    await this.users.createRefreshToken({
      userId: user.id,
      tokenHash: otpHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
      userAgent: OTP_UA,
      ip: meta?.ip,
    });

    await this.mail.sendPasswordResetOtp({
      to: user.email,
      otp,
      expiresInMinutes: OTP_TTL_MINUTES,
    });

    await this.audit.recordMutation({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'auth.password_reset',
      entityId: user.id,
      newValues: { event: 'OTP_REQUESTED' },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return generic;
  }

  /**
   * Step 2 — verify OTP. On success, issues a short-lived one-time reset
   * session token (hashed at rest) used by reset-password.
   */
  async verifyResetOtp(
    email: string,
    otp: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ ok: true; resetToken: string; expiresInMinutes: number }> {
    const normalized = email.trim().toLowerCase();
    const code = otp.trim();
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Enter the 6-digit code from your email');
    }

    const user = await this.users.findByEmail(normalized);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    const attempts = this.otpAttempts.get(user.id);
    if (attempts && attempts.count >= OTP_MAX_ATTEMPTS) {
      if (Date.now() - attempts.windowStarted < FORGOT_WINDOW_MS) {
        throw new UnauthorizedException(
          'Too many incorrect codes. Request a new code and try again later.',
        );
      }
      this.otpAttempts.delete(user.id);
    }

    const otpHash = this.hashOtp(user.id, code);
    const record = await this.users.findChallengeByHash(otpHash, OTP_UA);
    const valid =
      record &&
      !record.revokedAt &&
      record.expiresAt.getTime() >= Date.now() &&
      record.userId === user.id;

    if (!valid) {
      this.bumpOtpAttempt(user.id);
      throw new UnauthorizedException('Invalid or expired code');
    }

    await this.users.revokeRefreshByHash(otpHash);
    this.otpAttempts.delete(user.id);

    const resetToken = randomBytes(32).toString('base64url');
    const resetHash = this.hashToken(resetToken);
    await this.users.revokeUserChallenges(user.id, [RESET_UA]);
    await this.users.createRefreshToken({
      userId: user.id,
      tokenHash: resetHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
      userAgent: RESET_UA,
      ip: meta?.ip,
    });

    await this.audit.recordMutation({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'auth.password_reset',
      entityId: user.id,
      newValues: { event: 'OTP_VERIFIED' },
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return {
      ok: true,
      resetToken,
      expiresInMinutes: RESET_TTL_MINUTES,
    };
  }

  /** Step 3 — set a new password using the post-OTP reset session token. */
  async resetPassword(
    resetToken: string,
    newPassword: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ ok: true }> {
    const hash = this.hashToken(resetToken);
    const record = await this.users.findPasswordResetByHash(hash);
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired reset session');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.users.updatePasswordHash(record.userId, passwordHash);
    await this.users.revokeRefreshByHash(hash);
    await this.users.revokeUserChallenges(record.userId, [OTP_UA, RESET_UA]);
    await this.users.revokeAllForUser(record.userId);
    this.otpAttempts.delete(record.userId);
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
    this.emitAuthEvent(DOMAIN_EVENT_TYPES.AUTH_LOGOUT, { userId });
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
    this.emitAuthEvent(DOMAIN_EVENT_TYPES.AUTH_PASSWORD_CHANGED, { userId });
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

  /** HMAC-SHA256 of userId:otp with JWT secret as pepper — OTP never stored plaintext. */
  private hashOtp(userId: string, otp: string): string {
    const pepper =
      this.config.get<string>('jwt.secret') ||
      process.env.JWT_SECRET ||
      'default-dev-secret-change-in-production';
    return createHmac('sha256', pepper).update(`${userId}:${otp}`).digest('hex');
  }

  private assertForgotRateLimit(key: string): void {
    const now = Date.now();
    const hits = (this.forgotHits.get(key) ?? []).filter(
      (t) => now - t < FORGOT_WINDOW_MS,
    );
    if (hits.length >= FORGOT_MAX_PER_EMAIL) {
      throw new BadRequestException(
        'Too many reset requests. Please wait a few minutes and try again.',
      );
    }
    hits.push(now);
    this.forgotHits.set(key, hits);
  }

  private bumpOtpAttempt(userId: string): void {
    const now = Date.now();
    const prev = this.otpAttempts.get(userId);
    if (!prev || now - prev.windowStarted >= FORGOT_WINDOW_MS) {
      this.otpAttempts.set(userId, { count: 1, windowStarted: now });
      return;
    }
    this.otpAttempts.set(userId, {
      count: prev.count + 1,
      windowStarted: prev.windowStarted,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emitAuthEvent(
    type: string,
    payload: Record<string, unknown>,
  ): void {
    try {
      this.events.emit(
        type,
        createDomainEventEnvelope({ type, payload }),
      );
    } catch {
      // Auth must never fail because notification infrastructure is down.
    }
  }

  private toPublic(user: AuthUser): AuthUserPublic {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      position: user.position,
      permissions: user.permissions,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      staffProfileId: user.staffProfileId ?? null,
    };
  }
}
