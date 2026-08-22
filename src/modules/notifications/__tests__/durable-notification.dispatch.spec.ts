/**
 * Durable persist-before-delivery + idempotency acceptance tests.
 */

import { Test } from '@nestjs/testing';
import { NotificationDispatcherService } from '../dispatch/notification-dispatcher.service';
import { NotificationPolicyService } from '../policy/notification-policy.service';
import { DurableNotificationService } from '../services/durable-notification.service';
import { createDomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import { DOMAIN_EVENT_TYPES } from '../policy/notification-policy.service';
import { NOTIFICATIONS_QUEUE } from '../constants/notifications.constants';
import { getQueueToken } from '@nestjs/bull';

describe('Durable notification dispatch', () => {
  const durable = {
    persistMany: jest.fn(),
  };
  const queue = {
    add: jest.fn(),
    getJob: jest.fn(),
  };

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

  it('persists durable rows before enqueueing channel jobs', async () => {
    durable.persistMany.mockResolvedValue([
      {
        id: 'n1',
        userId: 'tech-1',
        notificationType: 'laboratory.request_created',
        title: 'New laboratory request',
        body: 'A new laboratory request is waiting in the queue.',
        priority: 'NORMAL',
        actionPath: '/laboratory',
        entityType: 'laboratory_request',
        entityId: 'req-1',
        created: true,
        idempotencyKey: 'evt-1:tech-1:laboratory.request_created',
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
    // Force stable id for assertions
    (event as { id: string }).id = 'evt-1';

    const result = await dispatcher.dispatchDomainEvent(event);

    expect(durable.persistMany).toHaveBeenCalledTimes(1);
    expect(durable.persistMany.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0],
    );
    expect(result.persisted).toBe(1);
    expect(result.queued).toBeGreaterThan(0);

    const wsUserJob = queue.add.mock.calls.find(
      (c: unknown[]) =>
        c[0] === 'notification.send_websocket' &&
        (c[1] as { userId?: string }).userId === 'tech-1',
    );
    expect(wsUserJob).toBeTruthy();
    expect(wsUserJob![1].notificationId).toBe('n1');
    expect(wsUserJob![1].payload.isLive).toBe(true);
  });

  it('does not count duplicate durable rows as new persists', async () => {
    durable.persistMany.mockResolvedValue([
      {
        id: 'n1',
        userId: 'doc-1',
        notificationType: 'laboratory.results_ready',
        title: 'Laboratory results ready',
        body: 'Laboratory results are ready for review.',
        priority: 'NORMAL',
        actionPath: '/laboratory',
        entityType: 'laboratory_request',
        entityId: 'req-1',
        created: false,
        idempotencyKey: 'evt-2:doc-1:laboratory.results_ready',
      },
    ]);

    const event = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.LAB_RESULTS_READY,
      payload: { requestId: 'req-1', doctorUserId: 'doc-1' },
    });
    (event as { id: string }).id = 'evt-2';

    const first = await dispatcher.dispatchDomainEvent(event);
    const second = await dispatcher.dispatchDomainEvent(event);

    expect(first.persisted).toBe(0);
    expect(second.persisted).toBe(0);
    expect(durable.persistMany).toHaveBeenCalledTimes(2);
  });

  it('keeps prescription.created durable for pharmacists', async () => {
    durable.persistMany.mockResolvedValue([
      {
        id: 'n-rx',
        userId: 'pharm-1',
        notificationType: 'prescription.created',
        title: 'New prescription',
        body: 'A new prescription is ready for pharmacy review.',
        priority: 'NORMAL',
        actionPath: '/pharmacy',
        entityType: 'prescription',
        entityId: 'rx-1',
        created: true,
        idempotencyKey: 'evt-3:pharm-1:prescription.created',
      },
    ]);

    const event = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.PRESCRIPTION_CREATED,
      payload: {
        prescriptionId: 'rx-1',
        pharmacistUserIds: ['pharm-1'],
      },
    });
    (event as { id: string }).id = 'evt-3';

    const result = await dispatcher.dispatchDomainEvent(event);
    expect(result.persisted).toBe(1);
    expect(queue.add).toHaveBeenCalled();
  });
});

describe('DurableNotificationService idempotency', () => {
  it('returns existing row when idempotency_key already exists', async () => {
    const prisma = {
      notifications: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'existing',
            user_id: 'u1',
            notification_type: 'laboratory.request_created',
            title: 'New laboratory request',
            encrypted_body: null,
            priority: 'NORMAL',
            action_path: '/laboratory',
            entity_type: 'laboratory_request',
            entity_id: 'req-1',
          }),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const encryption = {
      encryptPayload: jest.fn((s: string) => s),
      decryptPayload: jest.fn((s: string) => s),
    };
    const { DurableNotificationService: Svc } = await import(
      '../services/durable-notification.service'
    );
    const svc = new Svc(prisma as never, encryption as never);
    const row = await svc.persistOne({
      userId: 'u1',
      notificationType: 'laboratory.request_created',
      title: 'New laboratory request',
      body: 'Queue item',
      idempotencyKey: 'e:u1:laboratory.request_created',
      entityType: 'laboratory_request',
      entityId: 'req-1',
      actionPath: '/laboratory',
    });
    expect(row.id).toBe('existing');
    expect(row.created).toBe(false);
  });
});
