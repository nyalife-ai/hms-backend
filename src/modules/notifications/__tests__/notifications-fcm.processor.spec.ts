/**
 * FCM worker path — real token lookup + send (mocked FCM transport).
 */

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsProcessor } from '../processors/notifications.processor';
import { NotificationAdapter } from '../adapters/notification.adapter';
import { RecipientResolverService } from '../recipients/recipient-resolver.service';
import { DeviceTokensService } from '../services/device-tokens.service';
import { DurableNotificationService } from '../services/durable-notification.service';
import { FcmService } from '../services/fcm.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NOTIFICATION_JOBS } from '../jobs/notification.jobs';

describe('NotificationsProcessor FCM', () => {
  const deviceTokens = {
    listActiveTokens: jest.fn(),
    deactivateTokens: jest.fn(),
  };
  const fcm = {
    isConfigured: jest.fn(),
    send: jest.fn(),
  };
  const durable = {
    markWsDelivered: jest.fn(),
    markDeliveryFailed: jest.fn(),
    markChannelPartial: jest.fn(),
  };

  let processor: NotificationsProcessor;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsProcessor,
        { provide: NotificationAdapter, useValue: { sendSms: jest.fn() } },
        { provide: RecipientResolverService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: DeviceTokensService, useValue: deviceTokens },
        { provide: FcmService, useValue: fcm },
        { provide: DurableNotificationService, useValue: durable },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    processor = moduleRef.get(NotificationsProcessor);
  });

  it('returns no_tokens when user has no registered devices', async () => {
    deviceTokens.listActiveTokens.mockResolvedValue([]);
    const result = await processor.handleFcm({
      data: {
        eventId: 'e1',
        templateKey: 'appointment.created.doctor.push',
        userId: 'u1',
        dedupeKey: 'd1',
      },
    } as never);
    expect(result).toEqual({ sent: 0, failed: 0, reason: 'no_tokens' });
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it('throws when tokens exist but FCM is not configured', async () => {
    deviceTokens.listActiveTokens.mockResolvedValue(['tok-1']);
    fcm.isConfigured.mockReturnValue(false);
    await expect(
      processor.handleFcm({
        data: {
          eventId: 'e1',
          templateKey: 'appointment.created.doctor.push',
          userId: 'u1',
          dedupeKey: 'd1',
        },
      } as never),
    ).rejects.toThrow(/FCM credentials/);
  });

  it('sends to active tokens and deactivates invalid ones', async () => {
    deviceTokens.listActiveTokens.mockResolvedValue(['good', 'bad']);
    fcm.isConfigured.mockReturnValue(true);
    fcm.send
      .mockResolvedValueOnce({ ok: true, messageId: 'm1' })
      .mockResolvedValueOnce({
        ok: false,
        invalidToken: true,
        error: 'gone',
      });

    const result = await processor.handleFcm({
      data: {
        eventId: 'e1',
        templateKey: 'appointment.created.doctor.push',
        userId: 'u1',
        variables: { appointmentId: 'a1' },
        dedupeKey: 'd1',
      },
    } as never);

    expect(result).toEqual({ sent: 1, failed: 1 });
    expect(deviceTokens.deactivateTokens).toHaveBeenCalledWith(['bad']);
    expect(fcm.send).toHaveBeenCalledTimes(2);
  });

  it('exposes SEND_FCM job name', () => {
    expect(NOTIFICATION_JOBS.SEND_FCM).toBe('notification.send_fcm');
  });
});
