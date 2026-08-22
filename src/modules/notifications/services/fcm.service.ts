/**
 * Firebase Cloud Messaging via firebase-admin.
 * Credentials from config push.* ← PUSH_PROVIDER_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export type FcmSendInput = {
  readonly token: string;
  readonly title: string;
  readonly body: string;
  readonly data?: Readonly<Record<string, string>>;
};

export type FcmSendOutcome =
  | { ok: true; messageId: string }
  | { ok: false; invalidToken: boolean; error: string };

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private ready = false;

  public constructor(private readonly config: ConfigService) {}

  public onModuleInit(): void {
    this.ensureApp();
  }

  public isConfigured(): boolean {
    return this.ready || this.canConfigure();
  }

  public async send(input: FcmSendInput): Promise<FcmSendOutcome> {
    if (!this.ensureApp()) {
      return {
        ok: false,
        invalidToken: false,
        error:
          'FCM is not configured — set PUSH_PROVIDER_PROJECT_ID, PUSH_PROVIDER_CLIENT_EMAIL, PUSH_PROVIDER_PRIVATE_KEY',
      };
    }

    try {
      const messageId = await admin.messaging().send({
        token: input.token,
        notification: {
          title: input.title,
          body: input.body,
        },
        data: input.data,
      });
      return { ok: true, messageId };
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code ?? '')
          : '';
      const message = err instanceof Error ? err.message : String(err);
      const invalidToken =
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        /not.?registered|invalid.?token|invalid-argument/i.test(message);

      this.logger.warn(
        `FCM send failed invalidToken=${invalidToken} code=${code}: ${message}`,
      );
      return { ok: false, invalidToken, error: message };
    }
  }

  private canConfigure(): boolean {
    const projectId = this.config.get<string>('push.projectId')?.trim();
    const clientEmail = this.config.get<string>('push.clientEmail')?.trim();
    const privateKey = this.config.get<string>('push.privateKey')?.trim();
    return Boolean(projectId && clientEmail && privateKey);
  }

  private ensureApp(): boolean {
    if (this.ready) return true;

    const projectId = this.config.get<string>('push.projectId')?.trim();
    const clientEmail = this.config.get<string>('push.clientEmail')?.trim();
    const privateKey = this.config.get<string>('push.privateKey')?.trim();

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'FCM credentials missing (push.projectId / clientEmail / privateKey)',
      );
      return false;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
    this.ready = true;
    this.logger.log(`FCM initialized projectId=${projectId}`);
    return true;
  }
}
