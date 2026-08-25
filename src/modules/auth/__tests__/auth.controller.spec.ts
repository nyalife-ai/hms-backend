/**
 * AuthController — delegates to AuthService for each route.
 */

import { BadRequestException } from '@nestjs/common';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

describe('AuthController', () => {
  const auth = {
    isDemoAuthEnabled: jest.fn().mockReturnValue(false),
    login: jest.fn().mockResolvedValue({ accessToken: 'a' }),
    verifyLoginOtp: jest.fn().mockResolvedValue({ accessToken: 'a' }),
    registerPatient: jest.fn().mockResolvedValue({ accessToken: 'a' }),
    forgotPassword: jest.fn().mockResolvedValue({ ok: true }),
    verifyResetOtp: jest.fn().mockResolvedValue({ resetToken: 'r' }),
    resetPassword: jest.fn().mockResolvedValue({ ok: true }),
    refresh: jest.fn().mockResolvedValue({ accessToken: 'a' }),
    demoLogin: jest.fn().mockResolvedValue({ accessToken: 'a' }),
    listDemoAccounts: jest.fn().mockResolvedValue([{ email: 'a@test.com' }]),
    me: jest.fn().mockResolvedValue({ id: 'u1' }),
    getMyProfile: jest.fn().mockResolvedValue({ firstName: 'A' }),
    updateMyProfile: jest.fn().mockResolvedValue({ firstName: 'B' }),
    uploadMyAvatar: jest.fn().mockResolvedValue({ profileImage: 'k' }),
    startTwoFactorChallenge: jest.fn().mockResolvedValue({ hash: 'h'.repeat(40) }),
    confirmTwoFactorChallenge: jest.fn().mockResolvedValue({ id: 'u1' }),
    logout: jest.fn().mockResolvedValue({ ok: true }),
    changePassword: jest.fn().mockResolvedValue({ ok: true }),
  };

  const controller = new AuthController(auth as unknown as AuthService);
  const req = {
    headers: { 'user-agent': 'jest' },
    ip: '127.0.0.1',
    user: { id: 'u1' },
  } as never;

  beforeEach(() => jest.clearAllMocks());

  it('features reports demo flag', () => {
    const res = controller.features();
    expect(res).toEqual({
      demoAuthEnabled: false,
      passwordLogin: true,
      patientRegistration: true,
      passwordReset: true,
      twoFactorLogin: true,
    });
  });

  it('login forwards credentials and meta', async () => {
    await controller.login(
      { email: 'a@test.com', password: 'secret123' } as never,
      req,
    );
    expect(auth.login).toHaveBeenCalledWith(
      'a@test.com',
      'secret123',
      expect.objectContaining({ userAgent: 'jest', ip: '127.0.0.1' }),
    );
  });

  it('verifyLoginOtp / register / password reset wire through', async () => {
    await controller.verifyLoginOtp(
      { hash: 'h'.repeat(40), otp: '123456' } as never,
      req,
    );
    await controller.register(
      {
        email: 'p@test.com',
        password: 'secret123',
        firstName: 'P',
        lastName: 'T',
      } as never,
      req,
    );
    await controller.forgotPassword({ email: 'p@test.com' } as never, req);
    await controller.verifyResetOtp(
      { email: 'p@test.com', otp: '123456' } as never,
      req,
    );
    await controller.resetPassword(
      { resetToken: 'tok', newPassword: 'newpass12' } as never,
      req,
    );
    expect(auth.verifyLoginOtp).toHaveBeenCalled();
    expect(auth.registerPatient).toHaveBeenCalled();
    expect(auth.forgotPassword).toHaveBeenCalled();
    expect(auth.verifyResetOtp).toHaveBeenCalled();
    expect(auth.resetPassword).toHaveBeenCalled();
  });

  it('refresh and demo endpoints', async () => {
    await controller.refresh({ refreshToken: 'rt' } as never, req);
    await controller.demoLogin({ role: 'ADMIN' } as never, req);
    auth.isDemoAuthEnabled.mockReturnValueOnce(true);
    const accounts = await controller.demoAccounts();
    expect(auth.refresh).toHaveBeenCalled();
    expect(auth.demoLogin).toHaveBeenCalledWith(
      'ADMIN',
      expect.objectContaining({ userAgent: 'jest' }),
    );
    expect(accounts.enabled).toBe(true);
    expect(accounts.accounts).toHaveLength(1);
  });

  it('demoAccounts returns empty list when demo disabled', async () => {
    auth.isDemoAuthEnabled.mockReturnValue(false);
    const res = await controller.demoAccounts();
    expect(res).toEqual({ enabled: false, accounts: [] });
    expect(auth.listDemoAccounts).not.toHaveBeenCalled();
  });

  it('authenticated me / profile / 2fa challenge / logout / changePassword', async () => {
    await controller.me(req);
    await controller.getMyProfile(req);
    await controller.updateMyProfile(req, { firstName: 'Ada' } as never);
    await controller.startTwoFactorChallenge(req, {
      intent: 'enable',
      channel: 'email',
    } as never);
    await controller.confirmTwoFactorChallenge(req, {
      hash: 'h'.repeat(40),
      otp: '123456',
      intent: 'enable',
    } as never);
    await controller.logout(req, { refreshToken: 'rt' } as never);
    await controller.changePassword(req, {
      currentPassword: 'old',
      newPassword: 'newpass12',
    } as never);
    expect(auth.me).toHaveBeenCalledWith('u1');
    expect(auth.getMyProfile).toHaveBeenCalledWith('u1');
    expect(auth.updateMyProfile).toHaveBeenCalledWith('u1', { firstName: 'Ada' });
    expect(auth.startTwoFactorChallenge).toHaveBeenCalledWith(
      'u1',
      'enable',
      'email',
      expect.objectContaining({ userAgent: 'jest' }),
    );
    expect(auth.confirmTwoFactorChallenge).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ otp: '123456', intent: 'enable' }),
      expect.any(Object),
    );
    expect(auth.logout).toHaveBeenCalledWith('u1', 'rt');
    expect(auth.changePassword).toHaveBeenCalledWith(
      'u1',
      'old',
      'newpass12',
    );
  });

  it('deprecated PATCH me/two-factor returns 400', () => {
    expect(() => controller.setTwoFactor()).toThrow(BadRequestException);
  });
});
