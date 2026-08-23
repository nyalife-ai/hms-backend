/**
 * AuthMailService — SMTP absent → log mode; SMTP failure → log fallback.
 */

import { ConfigService } from '@nestjs/config';
import { AuthMailService } from '../auth-mail.service';

const sendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail })),
}));

describe('AuthMailService', () => {
  beforeEach(() => {
    sendMail.mockReset();
    delete process.env.SMTP_HOST;
  });

  it('logs OTP when SMTP host is not configured', async () => {
    const mail = new AuthMailService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    const reset = await mail.sendPasswordResetOtp({
      to: 'a@test.com',
      otp: '123456',
      expiresInMinutes: 10,
    });
    const login = await mail.sendLoginOtp({
      to: 'a@test.com',
      otp: '654321',
      expiresInMinutes: 10,
    });
    expect(reset).toEqual({ delivered: false, mode: 'log' });
    expect(login).toEqual({ delivered: false, mode: 'log' });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('falls back to log when SMTP send fails outside production', async () => {
    sendMail.mockRejectedValue(new Error('smtp down'));
    const mail = new AuthMailService({
      get: jest.fn((key: string) => {
        if (key === 'email.host') return 'smtp.example.com';
        if (key === 'email.from') return 'noreply@test.com';
        if (key === 'app.environment') return 'test';
        return undefined;
      }),
    } as unknown as ConfigService);
    const res = await mail.sendLoginOtp({
      to: 'a@test.com',
      otp: '111222',
      expiresInMinutes: 5,
    });
    expect(res).toEqual({ delivered: false, mode: 'log' });
  });

  it('returns smtp mode when sendMail succeeds', async () => {
    sendMail.mockResolvedValue({});
    const mail = new AuthMailService({
      get: jest.fn((key: string) => {
        if (key === 'email.host') return 'smtp.example.com';
        if (key === 'email.port') return 587;
        if (key === 'email.from') return 'noreply@test.com';
        return undefined;
      }),
    } as unknown as ConfigService);
    const res = await mail.sendPasswordResetOtp({
      to: 'a@test.com',
      otp: '999888',
      expiresInMinutes: 10,
    });
    expect(res).toEqual({ delivered: true, mode: 'smtp' });
    expect(sendMail).toHaveBeenCalled();
  });
});
