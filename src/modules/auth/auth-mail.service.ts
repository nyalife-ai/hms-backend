/**
 * Lightweight auth email sender — SMTP when configured, console fallback in dev.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer') as {
  createTransport: (opts: Record<string, unknown>) => {
    sendMail: (opts: Record<string, unknown>) => Promise<unknown>;
  };
};

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);

  public constructor(private readonly config: ConfigService) {}

  public async sendPasswordResetOtp(input: {
    to: string;
    otp: string;
    expiresInMinutes: number;
  }): Promise<{ delivered: boolean; mode: 'smtp' | 'log' }> {
    return this.sendOtpEmail({
      ...input,
      subject: 'NyaLife password reset code',
      heading: 'Password reset',
      intro: 'You requested a password reset for your NyaLife account.',
    });
  }

  public async sendLoginOtp(input: {
    to: string;
    otp: string;
    expiresInMinutes: number;
  }): Promise<{ delivered: boolean; mode: 'smtp' | 'log' }> {
    return this.sendOtpEmail({
      ...input,
      subject: 'NyaLife sign-in verification code',
      heading: 'Sign-in verification',
      intro: 'Use this code to finish signing in to your NyaLife account.',
    });
  }

  private async sendOtpEmail(input: {
    to: string;
    otp: string;
    expiresInMinutes: number;
    subject: string;
    heading: string;
    intro: string;
  }): Promise<{ delivered: boolean; mode: 'smtp' | 'log' }> {
    const text = [
      input.intro,
      '',
      `Your one-time code is: ${input.otp}`,
      '',
      `This code expires in ${input.expiresInMinutes} minutes.`,
      'If you did not request this, you can ignore this email.',
      '',
      'Never share this code with anyone.',
    ].join('\n');
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1a1220">
        <h2 style="color:#d91a66;margin-bottom:8px">${input.heading}</h2>
        <p>${input.intro}</p>
        <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:24px 0">${input.otp}</p>
        <p style="color:#64748b;font-size:14px">This code expires in ${input.expiresInMinutes} minutes.</p>
        <p style="color:#64748b;font-size:13px">If you did not request this, ignore this email. Never share this code.</p>
      </div>
    `;

    const host = (
      this.config.get<string>('email.host') ||
      process.env.SMTP_HOST ||
      ''
    ).trim();
    const from =
      this.config.get<string>('email.from') ||
      process.env.SMTP_FROM ||
      'noreply@nyalife.health';

    if (!host) {
      this.logger.warn(
        `SMTP not configured — OTP for ${input.to}: ${input.otp}`,
      );
      return { delivered: false, mode: 'log' };
    }

    try {
      const port = Number(
        this.config.get<number>('email.port') || process.env.SMTP_PORT || 587,
      );
      const secure =
        this.config.get<boolean>('email.secure') === true ||
        process.env.SMTP_SECURE === 'true';
      const user =
        this.config.get<string>('email.user') || process.env.SMTP_USER || '';
      const pass =
        this.config.get<string>('email.pass') || process.env.SMTP_PASS || '';

      const transport = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      });

      await transport.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text,
        html,
      });
      return { delivered: true, mode: 'smtp' };
    } catch (err) {
      this.logger.error(
        `Failed to send OTP to ${input.to}: ${err instanceof Error ? err.message : String(err)}`,
      );
      const env =
        this.config.get<string>('app.environment') ||
        process.env.NODE_ENV ||
        'development';
      if (env !== 'production') {
        this.logger.warn(`Dev fallback OTP for ${input.to}: ${input.otp}`);
      }
      return { delivered: false, mode: 'log' };
    }
  }
}
