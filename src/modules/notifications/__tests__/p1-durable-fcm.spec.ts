/**
 * P1 Notifications — durable persist BEFORE channel delivery; FCM soft-fail.
 * Strengthened: both FCM+WS must carry notificationId (no soft if-guards).
 */

import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NotificationAdapter } from '../adapters/notification.adapter';
import { NOTIFICATIONS_QUEUE } from '../constants/notifications.constants';
import { NotificationDispatcherService } from '../dispatch/notification-dispatcher.service';
import { createDomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import { NOTIFICATION_JOBS } from '../jobs/notification.jobs';
import {
  DOMAIN_EVENT_TYPES,
  NotificationPolicyService,
} from '../policy/notification-policy.service';
import { NotificationsProcessor } from '../processors/notifications.processor';
import { RecipientResolverService } from '../recipients/recipient-resolver.service';
import { DeviceTokensService } from '../services/device-tokens.service';
import { DurableNotificationService } from '../services/durable-notification.service';
import { FcmService } from '../services/fcm.service';
import { PrismaService } from '../../../database/prisma/prisma.service';

describe('P1 durable before delivery', () => {
  const durable = { persistMany: jest.fn() };
  const queue = { add: jest.fn(), getJob: jest.fn() };
  let dispatcher: NotificationDispatcherService;

  beforeEach(async () => {
    jest.resetAllMocks();
    queue.add.mockResolvedValue({});
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationDispatcherService,
        NotificationPolicyService,
        { provide: DurableNotificationService, useValue: durable },
        { provide: getQueueToken(NOTIFICATIONS_QUEUE.NAME), useValue: queue },
      ],
    }).compile();
    dispatcher = moduleRef.get(NotificationDispatcherService);
  });

  it('persists durable rows before any Bull enqueue', async () => {
    durable.persistMany.mockResolvedValue([
      {
        id: 'n-lab',
        userId: 'tech-1',
        notificationType: 'laboratory.request_created',
        title: 'New laboratory request',
        body: 'Waiting in queue.',
        priority: 'NORMAL',
        actionPath: '/laboratory',
        entityType: 'laboratory_request',
        entityId: 'req-1',
        created: true,
        idempotencyKey: 'evt-p1:tech-1:laboratory.request_created',
      },
    ]);

    const event = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.LAB_REQUEST_CREATED,
      payload: {
        requestId: 'req-1',
        priority: 'NORMAL',
        technicianUserIds: ['tech-1'],
      },
    });
    (event as { id: string }).id = 'evt-p1';

    const result = await dispatcher.dispatchDomainEvent(event);

    expect(durable.persistMany).toHaveBeenCalledTimes(1);
    expect(durable.persistMany.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0],
    );
    expect(result.persisted).toBe(1);
    expect(result.queued).toBeGreaterThan(0);
  });

  it('attaches durable notificationId to BOTH FCM and websocket jobs', async () => {
    durable.persistMany.mockResolvedValue([
      {
        id: 'n-doc',
        userId: 'doc-1',
        notificationType: 'laboratory.results_ready',
        title: 'Results ready',
        body: 'Review results.',
        priority: 'NORMAL',
        actionPath: '/laboratory',
        entityType: 'laboratory_request',
        entityId: 'req-2',
        created: true,
        idempotencyKey: 'evt-p1b:doc-1:laboratory.results_ready',
      },
    ]);

    const event = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.LAB_RESULTS_READY,
      payload: {
        requestId: 'req-2',
        doctorUserId: 'doc-1',
      },
    });
    (event as { id: string }).id = 'evt-p1b';

    await dispatcher.dispatchDomainEvent(event);

    const fcm = queue.add.mock.calls.find(
      (c) => c[0] === NOTIFICATION_JOBS.SEND_FCM,
    );
    const ws = queue.add.mock.calls.find(
      (c) =>
        c[0] === NOTIFICATION_JOBS.SEND_WEBSOCKET &&
        (c[1] as { userId?: string }).userId === 'doc-1',
    );

    expect(fcm).toBeTruthy();
    expect(ws).toBeTruthy();
    expect(fcm![1].notificationId).toBe('n-doc');
    expect(ws![1].notificationId).toBe('n-doc');
    expect(ws![1].payload.isLive).toBe(true);
  });

  it('does not enqueue when durable persist throws', async () => {
    durable.persistMany.mockRejectedValue(new Error('db down'));

    const event = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.LAB_REQUEST_CREATED,
      payload: {
        requestId: 'req-x',
        priority: 'NORMAL',
        technicianUserIds: ['tech-1'],
      },
    });

    await expect(dispatcher.dispatchDomainEvent(event)).rejects.toThrow(
      /db down/,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('SMS-only intents enqueue without durable persist', async () => {
    const event = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.PAYMENT_FAILED,
      payload: { patientId: 'pat-1', visitId: 'v-1' },
    });
    (event as { id: string }).id = 'evt-sms';

    const result = await dispatcher.dispatchDomainEvent(event);
    expect(durable.persistMany).not.toHaveBeenCalled();
    expect(result.persisted).toBe(0);
    expect(result.queued).toBeGreaterThan(0);
    expect(queue.add.mock.calls[0][0]).toBe(NOTIFICATION_JOBS.SEND_SMS);
  });
});

describe('P1 FCM soft-fail + durable delivery marks', () => {
  it('FcmService.send soft-fails when credentials missing', async () => {
    const fcm = new FcmService({ get: () => '' } as unknown as ConfigService);
    fcm.onModuleInit();
    const outcome = await fcm.send({
      token: 't',
      title: 'x',
      body: 'y',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toMatch(/not configured/i);
    }
  });

  it('FCM processor throws when tokens exist but FCM unconfigured', async () => {
    const deviceTokens = {
      listActiveTokens: jest.fn().mockResolvedValue(['tok']),
      deactivateTokens: jest.fn(),
    };
    const fcm = {
      isConfigured: jest.fn().mockReturnValue(false),
      send: jest.fn(),
    };
    const durable = {
      markChannelPartial: jest.fn(),
      markDeliveryFailed: jest.fn(),
      markWsDelivered: jest.fn(),
    };

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

    const processor = moduleRef.get(NotificationsProcessor);
    await expect(
      processor.handleFcm({
        data: {
          eventId: 'e1',
          templateKey: 'appointment.created.doctor.push',
          userId: 'u1',
          dedupeKey: 'd1',
          notificationId: 'n1',
        },
      } as never),
    ).rejects.toThrow(/FCM credentials/);
    expect(fcm.send).not.toHaveBeenCalled();
    expect(durable.markChannelPartial).not.toHaveBeenCalled();
  });

  it('successful FCM send marks durable channel PARTIAL', async () => {
    const deviceTokens = {
      listActiveTokens: jest.fn().mockResolvedValue(['tok-good']),
      deactivateTokens: jest.fn(),
    };
    const fcm = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({ ok: true, messageId: 'm1' }),
    };
    const durable = {
      markChannelPartial: jest.fn(),
      markDeliveryFailed: jest.fn(),
      markWsDelivered: jest.fn(),
    };

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

    const processor = moduleRef.get(NotificationsProcessor);
    const result = await processor.handleFcm({
      data: {
        eventId: 'e1',
        templateKey: 'appointment.created.doctor.push',
        userId: 'u1',
        dedupeKey: 'd1',
        notificationId: 'n-live',
        variables: { appointmentId: 'a1' },
      },
    } as never);

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(durable.markChannelPartial).toHaveBeenCalledWith('n-live');
    expect(durable.markDeliveryFailed).not.toHaveBeenCalled();
  });

  it('all-invalid FCM tokens mark durable FAILED', async () => {
    const deviceTokens = {
      listActiveTokens: jest.fn().mockResolvedValue(['bad']),
      deactivateTokens: jest.fn(),
    };
    const fcm = {
      isConfigured: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue({
        ok: false,
        invalidToken: true,
        error: 'gone',
      }),
    };
    const durable = {
      markChannelPartial: jest.fn(),
      markDeliveryFailed: jest.fn(),
      markWsDelivered: jest.fn(),
    };

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

    const processor = moduleRef.get(NotificationsProcessor);
    const result = await processor.handleFcm({
      data: {
        eventId: 'e1',
        templateKey: 'appointment.created.doctor.push',
        userId: 'u1',
        dedupeKey: 'd1',
        notificationId: 'n-fail',
      },
    } as never);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(deviceTokens.deactivateTokens).toHaveBeenCalledWith(['bad']);
    expect(durable.markDeliveryFailed).toHaveBeenCalledWith('n-fail');
  });
});
