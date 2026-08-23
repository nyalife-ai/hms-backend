/**
 * Notifications surface — entity/mapper/guard/adapter/templates/controller.
 */

import { ForbiddenException } from '@nestjs/common';
import { of } from 'rxjs';
import { Notification } from '../domain/notification.entity';
import { NotificationMapper } from '../mappers/notification.mapper';
import { NotificationAccessGuard } from '../guards/notification-access.guard';
import { NotificationsLoggingInterceptor } from '../interceptors/notifications.logging.interceptor';
import { NotificationAdapter } from '../adapters/notification.adapter';
import {
  isAfricasTalkingConfigured,
  loadAfricasTalkingOptions,
} from '../adapters/africastalking.config';
import { NotificationValidator } from '../validators/notification.validator';
import {
  NotificationCreatedEvent,
  NotificationDeletedEvent,
  NotificationUpdatedEvent,
} from '../events/notifications.events';
import { NotificationsListener } from '../listeners/notifications.listener';
import { NotificationsController } from '../notifications.controller';
import { NotificationsService } from '../notifications.service';
import { NotificationStatus } from '../enums/notification-status.enum';
import {
  findNotificationTemplate,
  getNotificationTemplate,
  renderNotificationBody,
} from '../templates/notification.templates';
import { createDomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import { durableKey, NOTIFICATION_JOBS } from '../jobs/notification.jobs';
import {
  NOTIFICATIONS_EVENTS,
  NOTIFICATIONS_QUEUE,
} from '../constants/notifications.constants';

describe('Notification entity', () => {
  it('creates with defaults and toggles read state', () => {
    const n = Notification.create({
      userId: 'u1',
      notificationType: 'ALERT',
      title: '  Hello  ',
      body: 'World',
    });
    expect(n.getTitle()).toBe('Hello');
    expect(n.getPriority()).toBe('NORMAL');
    expect(n.getDeliveryStatus()).toBe('QUEUED');
    expect(n.getIsRead()).toBe(false);
    n.update({ isRead: true });
    expect(n.getIsRead()).toBe(true);
    expect(n.getReadAt()).toBeInstanceOf(Date);
    n.update({ isRead: false, title: '  Bye  ' });
    expect(n.getIsRead()).toBe(false);
    expect(n.getReadAt()).toBeNull();
    expect(n.getTitle()).toBe('Bye');
  });

  it('reconstitutes and exposes getters', () => {
    const created = new Date('2024-01-01T00:00:00.000Z');
    const updated = new Date('2024-01-02T00:00:00.000Z');
    const n = Notification.reconstitute(
      'n1',
      {
        userId: 'u1',
        notificationType: 'INFO',
        title: 'T',
        priority: 'HIGH',
        deliveryStatus: 'SENT',
        entityType: 'visit',
        entityId: 'v1',
        actionPath: '/visits/v1',
      },
      created,
      updated,
    );
    expect(n.getId()).toBe('n1');
    expect(n.getUserId()).toBe('u1');
    expect(n.getNotificationType()).toBe('INFO');
    expect(n.getPriority()).toBe('HIGH');
    expect(n.getDeliveryStatus()).toBe('SENT');
    expect(n.getEntityType()).toBe('visit');
    expect(n.getEntityId()).toBe('v1');
    expect(n.getActionPath()).toBe('/visits/v1');
    expect(n.getCreatedAt().toISOString()).toBe(created.toISOString());
  });
});

describe('NotificationMapper', () => {
  it('maps entity to response DTO', () => {
    const n = Notification.create({
      userId: 'u1',
      notificationType: 'ALERT',
      title: 'Hi',
    });
    const dto = NotificationMapper.toResponse(n);
    expect(dto.id).toBe(n.getId());
    expect(dto.userId).toBe('u1');
    expect(dto.title).toBe('Hi');
    expect(NotificationMapper.toResponseList([n])).toHaveLength(1);
  });
});

describe('NotificationAccessGuard', () => {
  it('allows authenticated requests and blocks anonymous', () => {
    const guard = new NotificationAccessGuard();
    expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }),
      } as never),
    ).toBe(true);
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({}) }),
      } as never),
    ).toThrow(ForbiddenException);
  });
});

describe('NotificationsLoggingInterceptor', () => {
  it('passes through and logs duration', (done) => {
    const spy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const interceptor = new NotificationsLoggingInterceptor();
    interceptor
      .intercept(
        {
          switchToHttp: () => ({
            getRequest: () => ({ method: 'GET', url: '/notifications' }),
          }),
        } as never,
        { handle: () => of({ ok: true }) },
      )
      .subscribe({
        next: (v) => {
          expect(v).toEqual({ ok: true });
          expect(spy).toHaveBeenCalled();
          spy.mockRestore();
          done();
        },
      });
  });
});

describe('NotificationAdapter', () => {
  it('ping and sendSms behave with/without SMS gateway', async () => {
    const bare = new NotificationAdapter();
    await expect(bare.ping()).resolves.toBe(false);
    await expect(bare.sendSms({ to: '+254700', body: 'hi' })).rejects.toThrow(
      /not configured/i,
    );
    const sms = { send: jest.fn().mockResolvedValue({ ok: true }) };
    const wired = new NotificationAdapter(sms as never, 'africastalking');
    await expect(wired.ping()).resolves.toBe(true);
    await wired.sendSms({ to: '+254700', body: 'hi' });
    expect(sms.send).toHaveBeenCalledWith(
      'africastalking',
      expect.objectContaining({ to: '+254700', body: 'hi' }),
    );
  });
});

describe('AfricasTalking config', () => {
  const prevUser = process.env.AFRICASTALKING_USERNAME;
  const prevKey = process.env.AFRICASTALKING_API_KEY;

  afterEach(() => {
    if (prevUser === undefined) delete process.env.AFRICASTALKING_USERNAME;
    else process.env.AFRICASTALKING_USERNAME = prevUser;
    if (prevKey === undefined) delete process.env.AFRICASTALKING_API_KEY;
    else process.env.AFRICASTALKING_API_KEY = prevKey;
  });

  it('returns null when credentials missing', () => {
    delete process.env.AFRICASTALKING_USERNAME;
    delete process.env.AFRICASTALKING_API_KEY;
    expect(loadAfricasTalkingOptions()).toBeNull();
    expect(isAfricasTalkingConfigured()).toBe(false);
  });

  it('loads production options from ConfigService', () => {
    const config = {
      get: jest.fn((key: string) =>
        ({
          AFRICASTALKING_USERNAME: 'sandbox',
          AFRICASTALKING_API_KEY: 'key',
          AFRICASTALKING_FROM: 'NYA',
          AFRICASTALKING_ENV: 'production',
        })[key],
      ),
    };
    expect(loadAfricasTalkingOptions(config as never)).toEqual(
      expect.objectContaining({
        username: 'sandbox',
        apiKey: 'key',
        from: 'NYA',
        env: 'production',
      }),
    );
    expect(isAfricasTalkingConfigured(config as never)).toBe(true);
  });
});

describe('NotificationValidator', () => {
  it('requires a non-empty name', () => {
    const v = new NotificationValidator();
    expect(() => v.assertValidName('')).toThrow(/required/i);
    expect(() => v.assertValidName('ok')).not.toThrow();
  });
});

describe('events + listener', () => {
  it('constructs events and invokes listener handlers', () => {
    const created = new NotificationCreatedEvent('n1');
    const updated = new NotificationUpdatedEvent('n1');
    const deleted = new NotificationDeletedEvent('n1');
    expect(created.notificationId).toBe('n1');
    const listener = new NotificationsListener();
    expect(() => listener.onCreated(created)).not.toThrow();
    expect(() => listener.onUpdated(updated)).not.toThrow();
    expect(() => listener.onDeleted(deleted)).not.toThrow();
  });
});

describe('templates + jobs + constants', () => {
  it('resolves and renders templates', () => {
    const tpl = getNotificationTemplate('notifications.sms.test');
    expect(tpl?.channel).toBe('sms');
    expect(renderNotificationBody('Hi {{name}}', { name: 'Amina' })).toBe('Hi Amina');
    expect(renderNotificationBody('Hi {{name}}', {})).toBe('Hi ');
    expect(findNotificationTemplate('notifications.sms.test')).toEqual(tpl);
  });

  it('builds durable keys and exposes constants', () => {
    expect(durableKey('e1', 'u1', 'ALERT')).toBe('e1:u1:ALERT');
    expect(NOTIFICATION_JOBS.SEND_SMS).toContain('sms');
    expect(NOTIFICATIONS_EVENTS.CREATED).toContain('created');
    expect(NOTIFICATIONS_QUEUE.NAME).toBeTruthy();
    expect(NotificationStatus.PENDING).toBe('PENDING');
  });

  it('creates domain event envelopes', () => {
    const env = createDomainEventEnvelope({
      type: 'test.event',
      payload: { a: 1 },
      actorId: 'u1',
      id: 'fixed-id',
    });
    expect(env.id).toBe('fixed-id');
    expect(env.type).toBe('test.event');
    expect(env.payload).toEqual({ a: 1 });
    expect(env.occurredAt).toBeTruthy();
  });
});

describe('NotificationsController', () => {
  const service = {
    sendSms: jest.fn(),
    findMine: jest.fn(),
    unreadCount: jest.fn(),
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    registerDeviceToken: jest.fn(),
    unregisterDeviceToken: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
    findByIdForUser: jest.fn(),
    updateForUser: jest.fn(),
    softDelete: jest.fn(),
  };
  const controller = new NotificationsController(service as unknown as NotificationsService);
  const user = { id: 'u1', role: 'DOCTOR' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('delegates routes to NotificationsService', async () => {
    await controller.sendSms({ to: '+2547', message: 'hi' } as never, 'true');
    expect(service.sendSms).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sync: true }),
    );
    await controller.findMine(user, { page: 1 } as never);
    await controller.unreadCount(user);
    await controller.getPreferences(user);
    await controller.updatePreferences(user, { notificationSoundEnabled: false });
    await controller.markRead(user, 'n1');
    await controller.markAllRead(user);
    await controller.registerDeviceToken(user, { token: 't' } as never);
    await controller.unregisterDeviceToken(user, { token: 't' });
    await controller.create({ title: 'x' } as never);
    await controller.findAll(user, { page: 1 } as never);
    expect(service.findMine).toHaveBeenCalled();
    await controller.findAll({ id: 'a1', role: 'ADMIN' } as never, { page: 1 } as never);
    expect(service.findAll).toHaveBeenCalled();
    await controller.findOne(user, 'n1');
    expect(service.findByIdForUser).toHaveBeenCalledWith(user, 'n1');
    await controller.update(user, 'n1', { title: 'y' } as never);
    expect(service.updateForUser).toHaveBeenCalled();
    await controller.remove('n1');
    expect(service.softDelete).toHaveBeenCalledWith('n1');
  });
});
