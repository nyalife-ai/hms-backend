/**
 * File: notification.adapter.ts
 * Module: notifications
 * Purpose: Outbound adapter — SMS via Africa's Talking (platform SmsService).
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { SmsService } from '../../../platform/messaging/sms/sms.service';
import type { SmsSendResult } from '../../../platform/messaging/sms/sms-provider.interface';
import { NOTIFICATIONS_SMS_PROVIDER } from '../constants/notifications.constants';

export interface INotificationOutboundPort {
  ping(): Promise<boolean>;
  sendSms(input: {
    to: string;
    body: string;
    from?: string;
  }): Promise<SmsSendResult>;
}

@Injectable()
export class NotificationAdapter implements INotificationOutboundPort {
  private readonly logger = new Logger(NotificationAdapter.name);

  public constructor(
    @Optional() private readonly sms?: SmsService,
    @Optional()
    @Inject(NOTIFICATIONS_SMS_PROVIDER)
    private readonly preferredProvider?: string,
  ) {}

  public async ping(): Promise<boolean> {
    return Boolean(this.sms);
  }

  public async sendSms(input: {
    to: string;
    body: string;
    from?: string;
  }): Promise<SmsSendResult> {
    if (!this.sms) {
      throw new Error(
        'SMS gateway is not configured — set AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY',
      );
    }
    const provider = this.preferredProvider || 'africastalking';
    this.logger.debug(`Sending SMS via ${provider} to ${input.to}`);
    return this.sms.send(provider, {
      to: input.to,
      body: input.body,
      from: input.from,
    });
  }
}
