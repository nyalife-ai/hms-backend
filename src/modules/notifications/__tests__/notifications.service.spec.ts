/**
 * File: notifications.service.spec.ts
 * Module: notifications
 * Purpose: Behavioral unit tests for NotificationsService orchestration.
 */

import {
  ConflictException,
  NotFoundException as HttpNotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Result } from '../../../core/contracts';
import {
  NotFoundException,
  ValidationException,
} from '../../../core/exceptions';
import { NotificationsService } from '../notifications.service';
import { CreateNotificationUseCase } from '../use-cases/create-notification.usecase';
import { FindNotificationByIdUseCase } from '../use-cases/find-notification-by-id.usecase';
import { FindAllNotificationsUseCase } from '../use-cases/find-all-notifications.usecase';
import { UpdateNotificationUseCase } from '../use-cases/update-notification.usecase';
import { SoftDeleteNotificationUseCase } from '../use-cases/soft-delete-notification.usecase';
import { SendSmsUseCase } from '../use-cases/send-sms.usecase';
import { DeviceTokensService } from '../services/device-tokens.service';
import { DurableNotificationService } from '../services/durable-notification.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { Notification } from '../domain/notification.entity';
import { NOTIFICATIONS_EVENTS } from '../constants/notifications.constants';

function makeEntity(
  overrides: Partial<{
    id: string;
    userId: string;
    isRead: boolean;
  }> = {},
) {
  return Notification.create({
    id: overrides.id ?? 'n1',
    userId: overrides.userId ?? 'u1',
    notificationType: 'INFO',
    title: 'Hello',
    body: 'Body',
    isRead: overrides.isRead ?? false,
  });
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let createUseCase: { execute: jest.Mock };
  let findByIdUseCase: { execute: jest.Mock };
  let findAllUseCase: { execute: jest.Mock };
  let updateUseCase: { execute: jest.Mock };
  let softDeleteUseCase: { execute: jest.Mock };
  let sendSmsUseCase: { execute: jest.Mock };
  let deviceTokens: {
    register: jest.Mock;
    unregister: jest.Mock;
  };
  let durable: {
    countUnread: jest.Mock;
    getSoundPreference: jest.Mock;
    setSoundPreference: jest.Mock;
  };
  let prisma: { notifications: { updateMany: jest.Mock } };
  let events: { emit: jest.Mock };

  beforeEach(async () => {
    createUseCase = { execute: jest.fn() };
    findByIdUseCase = { execute: jest.fn() };
    findAllUseCase = { execute: jest.fn() };
    updateUseCase = { execute: jest.fn() };
    softDeleteUseCase = { execute: jest.fn() };
    sendSmsUseCase = { execute: jest.fn() };
    deviceTokens = {
      register: jest.fn().mockResolvedValue({ ok: true }),
      unregister: jest.fn().mockResolvedValue(undefined),
    };
    durable = {
      countUnread: jest.fn().mockResolvedValue(3),
      getSoundPreference: jest.fn().mockResolvedValue(true),
      setSoundPreference: jest.fn().mockResolvedValue({
        notificationSoundEnabled: false,
      }),
    };
    prisma = {
      notifications: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: CreateNotificationUseCase, useValue: createUseCase },
        { provide: FindNotificationByIdUseCase, useValue: findByIdUseCase },
        { provide: FindAllNotificationsUseCase, useValue: findAllUseCase },
        { provide: UpdateNotificationUseCase, useValue: updateUseCase },
        { provide: SoftDeleteNotificationUseCase, useValue: softDeleteUseCase },
        { provide: SendSmsUseCase, useValue: sendSmsUseCase },
        { provide: DeviceTokensService, useValue: deviceTokens },
        { provide: DurableNotificationService, useValue: durable },
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('creates a notification and emits CREATED', async () => {
    const entity = makeEntity();
    createUseCase.execute.mockResolvedValue(Result.success(entity));

    const res = await service.create({
      userId: 'u1',
      notificationType: 'INFO',
      title: 'Hello',
    } as never);

    expect(res.id).toBe(entity.getId());
    expect(res.title).toBe('Hello');
    expect(events.emit).toHaveBeenCalledWith(
      NOTIFICATIONS_EVENTS.CREATED,
      expect.objectContaining({ notificationId: entity.getId() }),
    );
  });

  it('findById maps entity to response', async () => {
    findByIdUseCase.execute.mockResolvedValue(Result.success(makeEntity()));
    const res = await service.findById('n1');
    expect(res.userId).toBe('u1');
  });

  it('findByIdForUser allows owner and admin; blocks other users', async () => {
    findByIdUseCase.execute.mockResolvedValue(
      Result.success(makeEntity({ userId: 'owner' })),
    );
    await expect(
      service.findByIdForUser({ id: 'owner', role: 'PATIENT' } as never, 'n1'),
    ).resolves.toMatchObject({ userId: 'owner' });

    await expect(
      service.findByIdForUser({ id: 'admin', role: 'ADMIN' } as never, 'n1'),
    ).resolves.toMatchObject({ userId: 'owner' });

    await expect(
      service.findByIdForUser(
        { id: 'other', role: 'DOCTOR' } as never,
        'n1',
      ),
    ).rejects.toBeInstanceOf(HttpNotFoundException);
  });

  it('findAll and findMine return paginated payloads', async () => {
    findAllUseCase.execute.mockResolvedValue(
      Result.success({ items: [makeEntity()], total: 1 }),
    );
    const page = await service.findAll({ page: 1, limit: 10 } as never);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);

    await service.findMine('u1', { page: 1, limit: 5 } as never);
    expect(findAllUseCase.execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('unreadCount and preferences paths', async () => {
    await expect(service.unreadCount('u1')).resolves.toEqual({ count: 3 });
    await expect(service.getPreferences('u1')).resolves.toEqual({
      notificationSoundEnabled: true,
    });

    await expect(
      service.updatePreferences('u1', { notificationSoundEnabled: false }),
    ).resolves.toEqual({ notificationSoundEnabled: false });
    expect(durable.setSoundPreference).toHaveBeenCalledWith('u1', false);

    await expect(service.updatePreferences('u1', {})).resolves.toEqual({
      notificationSoundEnabled: true,
    });
  });

  it('markRead updates when owned; rejects foreign user', async () => {
    findByIdUseCase.execute.mockResolvedValue(
      Result.success(makeEntity({ userId: 'u1' })),
    );
    updateUseCase.execute.mockResolvedValue(
      Result.success(makeEntity({ userId: 'u1', isRead: true })),
    );

    await expect(service.markRead('u1', 'n1')).resolves.toMatchObject({
      isRead: true,
    });
    expect(updateUseCase.execute).toHaveBeenCalledWith('n1', { isRead: true });

    findByIdUseCase.execute.mockResolvedValue(
      Result.success(makeEntity({ userId: 'other' })),
    );
    await expect(service.markRead('u1', 'n1')).rejects.toBeInstanceOf(
      HttpNotFoundException,
    );
  });

  it('markAllRead updates unread rows for user', async () => {
    await expect(service.markAllRead('u1')).resolves.toEqual({ ok: true });
    expect(prisma.notifications.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'u1', is_read: false },
      }),
    );
  });

  it('update emits UPDATED; updateForUser enforces ownership and admin full patch', async () => {
    const entity = makeEntity({ userId: 'u1' });
    updateUseCase.execute.mockResolvedValue(Result.success(entity));
    findByIdUseCase.execute.mockResolvedValue(Result.success(entity));

    await service.update('n1', { title: 'T2' } as never);
    expect(events.emit).toHaveBeenCalledWith(
      NOTIFICATIONS_EVENTS.UPDATED,
      expect.objectContaining({ notificationId: entity.getId() }),
    );

    await service.updateForUser(
      { id: 'u1', role: 'PATIENT' } as never,
      'n1',
      { isRead: true, title: 'ignored' } as never,
    );
    expect(updateUseCase.execute).toHaveBeenLastCalledWith('n1', {
      isRead: true,
    });

    await service.updateForUser(
      { id: 'admin', role: 'ADMIN' } as never,
      'n1',
      { title: 'Admin' } as never,
    );
    expect(updateUseCase.execute).toHaveBeenLastCalledWith('n1', {
      title: 'Admin',
    });

    findByIdUseCase.execute.mockResolvedValue(
      Result.success(makeEntity({ userId: 'owner' })),
    );
    await expect(
      service.updateForUser(
        { id: 'other', role: 'NURSE' } as never,
        'n1',
        { isRead: true } as never,
      ),
    ).rejects.toBeInstanceOf(HttpNotFoundException);
  });

  it('softDelete unwraps and emits DELETED', async () => {
    softDeleteUseCase.execute.mockResolvedValue(Result.success(undefined));
    await service.softDelete('n1');
    expect(events.emit).toHaveBeenCalledWith(
      NOTIFICATIONS_EVENTS.DELETED,
      expect.objectContaining({ notificationId: 'n1' }),
    );
  });

  it('sendSms emits on success and maps failure to ServiceUnavailable', async () => {
    sendSmsUseCase.execute.mockResolvedValue(
      Result.success({ messageId: 'm1' }),
    );
    await expect(
      service.sendSms({ to: '+254700', message: 'hi' } as never),
    ).resolves.toEqual({ messageId: 'm1' });
    expect(events.emit).toHaveBeenCalledWith(
      NOTIFICATIONS_EVENTS.SMS_SENT,
      { messageId: 'm1' },
    );

    sendSmsUseCase.execute.mockResolvedValue(Result.failure('gateway down'));
    await expect(
      service.sendSms({ to: '+254700', message: 'hi' } as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('register and unregister device tokens', async () => {
    await service.registerDeviceToken('u1', {
      token: 'tok',
      platform: 'android',
      deviceId: 'd1',
    } as never);
    expect(deviceTokens.register).toHaveBeenCalledWith({
      userId: 'u1',
      token: 'tok',
      platform: 'android',
      deviceId: 'd1',
    });

    await service.unregisterDeviceToken('u1', 'tok');
    expect(deviceTokens.unregister).toHaveBeenCalledWith('u1', 'tok');
  });

  it('unwrap maps NotFound, BaseApplication, and generic failures', async () => {
    findByIdUseCase.execute.mockResolvedValue(
      Result.failure(new NotFoundException('Notification', 'n1')),
    );
    await expect(service.findById('n1')).rejects.toBeInstanceOf(
      HttpNotFoundException,
    );

    findByIdUseCase.execute.mockResolvedValue(
      Result.failure(new ValidationException('bad')),
    );
    await expect(service.findById('n1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    findByIdUseCase.execute.mockResolvedValue(Result.failure('conflict'));
    await expect(service.findById('n1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
