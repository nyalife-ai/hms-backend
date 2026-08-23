/**
 * Bull notifications worker — SMS / FCM / websocket / appointment reminders.
 * Uses platform SmsService (NotificationAdapter) + RealtimeService.
 */

import {
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer') as {
  createTransport: (opts: Record<string, unknown>) => {
    sendMail: (opts: Record<string, unknown>) => Promise<unknown>;
  };
};
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RealtimeService } from '../../../platform/realtime/realtime.service';
import { NotificationAdapter } from '../adapters/notification.adapter';
import { NOTIFICATIONS_QUEUE } from '../constants/notifications.constants';
import {
  NOTIFICATION_JOBS,
  type AppointmentReminderJobData,
  type EmailJobData,
  type FcmJobData,
  type SmsJobData,
  type WebsocketJobData,
} from '../jobs/notification.jobs';
import { RecipientResolverService } from '../recipients/recipient-resolver.service';
import { DeviceTokensService } from '../services/device-tokens.service';
import { DurableNotificationService } from '../services/durable-notification.service';
import { FcmService } from '../services/fcm.service';
import {
  getNotificationTemplate,
  renderNotificationBody,
} from '../templates/notification.templates';

@Processor(NOTIFICATIONS_QUEUE.NAME)
export class NotificationsProcessor {
  private readonly logger = new Logger(NotificationsProcessor.name);

  public constructor(
    private readonly adapter: NotificationAdapter,
    private readonly recipients: RecipientResolverService,
    private readonly prisma: PrismaService,
    private readonly deviceTokens: DeviceTokensService,
    private readonly fcm: FcmService,
    private readonly durable: DurableNotificationService,
    private readonly config: ConfigService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  @OnQueueFailed()
  onFailed(job: Job, error: Error): void {
    this.logger.warn(
      `Job failed name=${job.name} id=${job.id} attempt=${job.attemptsMade}: ${error.message}`,
    );
  }

  @Process(NOTIFICATION_JOBS.SEND_SMS)
  public async handleSms(job: Job<SmsJobData>): Promise<{ messageId: string }> {
    const data = job.data;
    const template = getNotificationTemplate(data.templateKey);
    if (!template || template.channel !== 'sms') {
      throw new Error(`Unknown SMS template: ${data.templateKey}`);
    }

    const recipient = data.patientId
      ? await this.recipients.resolvePatient(data.patientId)
      : data.userId
        ? await this.recipients.resolveUser(data.userId)
        : null;
    if (!recipient) {
      throw new Error('SMS recipient could not be resolved');
    }

    const to = await this.recipients.requirePhone(recipient);
    const body = renderNotificationBody(template.body, data.variables ?? {});
    const result = await this.adapter.sendSms({ to, body });
    this.logger.log(
      `SMS sent eventId=${data.eventId} messageId=${result.messageId}`,
    );
    return { messageId: result.messageId };
  }

  @Process(NOTIFICATION_JOBS.SEND_EMAIL)
  public async handleEmail(
    job: Job<EmailJobData>,
  ): Promise<{ delivered: boolean; mode: 'smtp' | 'log' }> {
    const data = job.data;
    const template = getNotificationTemplate(data.templateKey);
    if (!template || template.channel !== 'email') {
      throw new Error(`Unknown email template: ${data.templateKey}`);
    }

    const recipient = await this.recipients.resolveUser(data.userId);
    if (!recipient) {
      throw new Error('Email recipient could not be resolved');
    }
    const to = await this.recipients.requireEmail(recipient);
    const subject = template.subject
      ? renderNotificationBody(template.subject, data.variables ?? {})
      : 'NyaLife';
    const text = renderNotificationBody(template.body, data.variables ?? {});

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
        `SMTP not configured — email eventId=${data.eventId} to=${to}`,
      );
      return { delivered: false, mode: 'log' };
    }

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
    await transport.sendMail({ from, to, subject, text });
    this.logger.log(`Email sent eventId=${data.eventId} to=${to}`);
    if (data.notificationId) {
      await this.durable.markChannelPartial(data.notificationId);
    }
    return { delivered: true, mode: 'smtp' };
  }

  @Process(NOTIFICATION_JOBS.SEND_FCM)
  public async handleFcm(
    job: Job<FcmJobData>,
  ): Promise<{ sent: number; failed: number; reason?: string }> {
    const data = job.data;
    const template = getNotificationTemplate(data.templateKey);
    if (!template || template.channel !== 'fcm') {
      throw new Error(`Unknown FCM template: ${data.templateKey}`);
    }

    const tokens = await this.deviceTokens.listActiveTokens(data.userId);
    if (!tokens.length) {
      this.logger.log(
        `FCM no active tokens userId=${data.userId} template=${data.templateKey}`,
      );
      return { sent: 0, failed: 0, reason: 'no_tokens' };
    }

    if (!this.fcm.isConfigured()) {
      // Fail the job so Bull retries / surfaces misconfiguration — do not pretend success.
      throw new Error(
        'FCM credentials are not configured (PUSH_PROVIDER_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY)',
      );
    }

    const title = template.subject
      ? renderNotificationBody(template.subject, data.variables ?? {})
      : 'NyaLife';
    const body = renderNotificationBody(template.body, data.variables ?? {});
    const payloadData: Record<string, string> = {
      eventId: data.eventId,
      templateKey: data.templateKey,
      ...(data.variables ?? {}),
    };

    let sent = 0;
    let failed = 0;
    const invalid: string[] = [];

    for (const token of tokens) {
      const outcome = await this.fcm.send({
        token,
        title,
        body,
        data: payloadData,
      });
      if (outcome.ok) {
        sent += 1;
      } else {
        failed += 1;
        if (outcome.invalidToken) invalid.push(token);
      }
    }

    if (invalid.length) {
      await this.deviceTokens.deactivateTokens(invalid);
    }

    this.logger.log(
      `FCM done userId=${data.userId} sent=${sent} failed=${failed} invalid=${invalid.length}`,
    );

    if (data.notificationId) {
      if (sent > 0) {
        await this.durable.markChannelPartial(data.notificationId);
      } else if (failed > 0) {
        await this.durable.markDeliveryFailed(data.notificationId);
      }
    }

    // If every token failed for a transient reason, retry the job.
    if (sent === 0 && failed > 0 && invalid.length < failed) {
      throw new Error(
        `FCM delivery failed for all tokens (sent=0 failed=${failed})`,
      );
    }

    return { sent, failed };
  }

  @Process(NOTIFICATION_JOBS.SEND_WEBSOCKET)
  public async handleWebsocket(
    job: Job<WebsocketJobData>,
  ): Promise<{ delivered: boolean }> {
    if (!this.realtime) {
      throw new Error(
        'RealtimeService is not available — websocket notification cannot be delivered',
      );
    }
    const data = job.data;
    try {
      if (data.userId) {
        await this.realtime.publishToUser(data.userId, {
          type: data.type,
          payload: data.payload,
        });
      } else if (data.room) {
        await this.realtime.publishToRoom(data.room, {
          type: data.type,
          payload: data.payload,
        });
      } else {
        throw new Error('Websocket job missing userId and room');
      }
      if (data.notificationId) {
        await this.durable.markWsDelivered(data.notificationId);
      }
      return { delivered: true };
    } catch (err) {
      if (data.notificationId) {
        await this.durable.markDeliveryFailed(data.notificationId);
      }
      throw err;
    }
  }

  @Process(NOTIFICATION_JOBS.APPOINTMENT_REMINDER)
  public async handleAppointmentReminder(
    job: Job<AppointmentReminderJobData>,
  ): Promise<{ sent: boolean; reason?: string }> {
    const data = job.data;
    const appointment = await this.prisma.appointments.findFirst({
      where: { id: data.appointmentId, deleted_at: null },
    });
    if (!appointment) return { sent: false, reason: 'missing' };

    const status = (appointment.status || '').toUpperCase();
    if (
      ['CANCELLED', 'CANCELED', 'COMPLETED', 'CHECKED_IN', 'NO_SHOW', 'ARCHIVED'].includes(
        status,
      )
    ) {
      return { sent: false, reason: `status_${status}` };
    }

    const startsAt = combineAppointmentStart(
      appointment.appointment_date,
      appointment.start_time,
    );
    const expected = Date.parse(data.expectedStartsAt);
    if (
      Number.isFinite(expected) &&
      startsAt &&
      Math.abs(startsAt.getTime() - expected) > 60_000
    ) {
      return { sent: false, reason: 'rescheduled' };
    }

    const template = getNotificationTemplate('appointment.reminder.patient.sms');
    if (!template) {
      throw new Error('Missing appointment.reminder.patient.sms template');
    }

    const recipient = await this.recipients.resolvePatient(
      appointment.patient_id,
    );
    if (!recipient) return { sent: false, reason: 'patient_missing' };

    let phone: string;
    try {
      phone = await this.recipients.requirePhone(recipient);
    } catch {
      return { sent: false, reason: 'no_phone' };
    }

    const body = renderNotificationBody(template.body, {
      appointmentDate: data.expectedStartsAt,
    });
    await this.adapter.sendSms({ to: phone, body });
    this.logger.log(
      `Appointment reminder sent appointmentId=${data.appointmentId}`,
    );
    return { sent: true };
  }
}

function combineAppointmentStart(date: Date, time: Date): Date | null {
  try {
    const d = new Date(date);
    const t = new Date(time);
    d.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), 0);
    return d;
  } catch {
    return null;
  }
}
