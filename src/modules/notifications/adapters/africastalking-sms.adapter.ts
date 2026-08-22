/**
 * File: africastalking-sms.adapter.ts
 * Module: notifications
 * Purpose: Africa's Talking SMS outbound adapter (implements platform SmsProvider).
 *
 * API: POST /version1/messaging (form-urlencoded)
 * Auth: apiKey header + username field
 * Docs: https://developers.africastalking.com/docs/sms/sending/bulk
 */

import type {
  SmsMessage,
  SmsProvider,
  SmsSendResult,
} from '../../../platform/messaging/sms/sms-provider.interface';
import type { HttpClient } from '../../../platform/messaging/webhooks/webhook.types';

export type AfricasTalkingEnv = 'sandbox' | 'production';

export interface AfricasTalkingSmsOptions {
  readonly username: string;
  readonly apiKey: string;
  /** Short code or alphanumeric sender ID (optional in sandbox). */
  readonly from?: string;
  readonly env?: AfricasTalkingEnv;
  /** Optional injectable HTTP client (platform webhook HttpClient shape). */
  readonly client?: HttpClient;
}

export class AfricasTalkingSmsAdapter implements SmsProvider {
  public readonly name = 'africastalking';

  public constructor(private readonly options: AfricasTalkingSmsOptions) {
    if (!options.username?.trim()) {
      throw new Error('AfricasTalkingSmsAdapter: username is required');
    }
    if (!options.apiKey?.trim()) {
      throw new Error('AfricasTalkingSmsAdapter: apiKey is required');
    }
  }

  private baseUrl(): string {
    return this.options.env === 'production'
      ? 'https://api.africastalking.com'
      : 'https://api.sandbox.africastalking.com';
  }

  public async send(message: SmsMessage): Promise<SmsSendResult> {
    const to = this.normalizeRecipients(message.to);
    if (!to.length) {
      throw new Error('AfricasTalkingSmsAdapter: recipient phone is required');
    }
    if (!message.body?.trim()) {
      throw new Error('AfricasTalkingSmsAdapter: message body is required');
    }

    const from = message.from?.trim() || this.options.from?.trim() || undefined;
    const params = new URLSearchParams();
    params.set('username', this.options.username.trim());
    params.set('to', to.join(','));
    params.set('message', message.body.trim());
    if (from) params.set('from', from);

    const url = `${this.baseUrl()}/version1/messaging`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      apiKey: this.options.apiKey.trim(),
    };
    const body = params.toString();

    let status: number;
    let responseBody: string;
    if (this.options.client) {
      const res = await this.options.client.request({
        url,
        method: 'POST',
        headers,
        body,
        timeoutMs: 20_000,
      });
      status = res.status;
      responseBody = res.body ?? '';
    } else {
      const res = await fetch(url, { method: 'POST', headers, body });
      status = res.status;
      responseBody = await res.text();
    }

    if (status < 200 || status >= 300) {
      throw new Error(
        `africastalking HTTP ${status}: ${responseBody.slice(0, 240)}`,
      );
    }

    const messageId = this.extractMessageId(responseBody);
    const accepted = this.isAccepted(responseBody);
    if (!accepted) {
      throw new Error(
        `africastalking rejected SMS: ${responseBody.slice(0, 240)}`,
      );
    }

    return {
      provider: this.name,
      messageId,
      accepted: true,
    };
  }

  /** Accept KE local (07…) or E.164 (+254… / 254…). */
  private normalizeRecipients(raw: string): string[] {
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((phone) => {
        const digits = phone.replace(/\D/g, '');
        if (digits.startsWith('254') && digits.length === 12) return `+${digits}`;
        if (digits.startsWith('0') && digits.length === 10)
          return `+254${digits.slice(1)}`;
        if (phone.startsWith('+') && digits.length >= 10) return `+${digits}`;
        return phone.startsWith('+') ? phone : `+${digits}`;
      });
  }

  private extractMessageId(raw: string): string {
    try {
      const json = JSON.parse(raw) as {
        SMSMessageData?: {
          Recipients?: Array<{ messageId?: string; statusCode?: number }>;
        };
      };
      const id = json.SMSMessageData?.Recipients?.[0]?.messageId;
      if (id) return id;
    } catch {
      /* plain text */
    }
    return raw.slice(0, 120) || `at-${Date.now()}`;
  }

  private isAccepted(raw: string): boolean {
    try {
      const json = JSON.parse(raw) as {
        SMSMessageData?: {
          Recipients?: Array<{ statusCode?: number; status?: string }>;
        };
      };
      const recipients = json.SMSMessageData?.Recipients ?? [];
      if (!recipients.length) return false;
      // AT: 100/101/102 = success family
      return recipients.some((r) => {
        const code = Number(r.statusCode);
        if (Number.isFinite(code)) return code >= 100 && code < 200;
        const status = (r.status || '').toLowerCase();
        return status.includes('success') || status.includes('sent');
      });
    } catch {
      return true;
    }
  }
}
