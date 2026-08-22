/**
 * Admin smoke-test SMS: domain recipient + template. Provider config from env.
 */

import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { createDomainEventId } from '../../../core/domain';
import type { SmsSendResult } from '../../../platform/messaging/sms/sms-provider.interface';
import { NotificationAdapter } from '../adapters/notification.adapter';
import { NotificationDispatcherService } from '../dispatch/notification-dispatcher.service';
import type { SendSmsDto } from '../dto';
import {
  NOTIFICATION_JOBS,
  type SmsJobData,
} from '../jobs/notification.jobs';
import { RecipientResolverService } from '../recipients/recipient-resolver.service';
import {
  getNotificationTemplate,
  renderNotificationBody,
} from '../templates/notification.templates';

@Injectable()
export class SendSmsUseCase {
  public constructor(
    private readonly adapter: NotificationAdapter,
    private readonly recipients: RecipientResolverService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  public async execute(
    dto: SendSmsDto,
    options?: { sync?: boolean },
  ): Promise<
    Result<{ queued: true; eventId: string } | SmsSendResult, string>
  > {
    if (!dto.patientId && !dto.userId) {
      throw new BadRequestException('Provide patientId or userId');
    }
    if (dto.patientId && dto.userId) {
      throw new BadRequestException('Provide only one of patientId or userId');
    }

    const template = getNotificationTemplate(dto.templateKey);
    if (!template || template.channel !== 'sms') {
      throw new BadRequestException(
        `Unknown or non-SMS templateKey: ${dto.templateKey}`,
      );
    }

    const recipient = dto.patientId
      ? await this.recipients.resolvePatient(dto.patientId)
      : await this.recipients.resolveUser(dto.userId!);
    if (!recipient) {
      throw new BadRequestException('Recipient not found');
    }

    const eventId = createDomainEventId();
    const variables = {
      ref: eventId.slice(-8),
      ...(dto.variables ?? {}),
    };

    if (options?.sync) {
      try {
        const to = await this.recipients.requirePhone(recipient);
        const body = renderNotificationBody(template.body, variables);
        const result = await this.adapter.sendSms({ to, body });
        return Result.ok(result);
      } catch (err) {
        return Result.fail(
          err instanceof Error ? err.message : 'SMS send failed',
        );
      }
    }

    const data: SmsJobData = {
      eventId,
      templateKey: dto.templateKey,
      patientId: dto.patientId,
      userId: dto.userId,
      variables,
      dedupeKey: `admin-sms-test:${eventId}`,
    };

    try {
      await this.dispatcher.enqueueIntent({
        eventId,
        eventType: 'notifications.sms.test',
        durable: [],
        jobs: [
          {
            name: NOTIFICATION_JOBS.SEND_SMS,
            data,
            jobId: data.dedupeKey,
          },
        ],
      });
      return Result.ok({ queued: true, eventId });
    } catch (err) {
      throw new ServiceUnavailableException(
        err instanceof Error ? err.message : 'Failed to queue SMS',
      );
    }
  }
}
