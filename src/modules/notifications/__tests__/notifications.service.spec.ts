/**
 * File: notifications.service.spec.ts
 * Module: notifications
 * Purpose: Service smoke unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications.service';
import { CreateNotificationUseCase } from '../use-cases/create-notification.usecase';
import { FindNotificationByIdUseCase } from '../use-cases/find-notification-by-id.usecase';
import { FindAllNotificationsUseCase } from '../use-cases/find-all-notifications.usecase';
import { UpdateNotificationUseCase } from '../use-cases/update-notification.usecase';
import { SoftDeleteNotificationUseCase } from '../use-cases/soft-delete-notification.usecase';
import { SendSmsUseCase } from '../use-cases/send-sms.usecase';
import { Result } from '../../../core/contracts';

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: CreateNotificationUseCase, useValue: { execute: jest.fn() } },
        {
          provide: FindNotificationByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAllNotificationsUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: UpdateNotificationUseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDeleteNotificationUseCase, useValue: { execute: jest.fn() } },
        { provide: SendSmsUseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll returns paginated payload', async () => {
    const res = await service.findAll({ page: 1, limit: 10 });
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });
});
