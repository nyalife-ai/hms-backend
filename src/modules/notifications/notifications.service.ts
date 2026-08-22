/**
 * File: notifications.service.ts
 * Module: notifications
 * Purpose: Application service orchestrating use-cases + SMS.
 */

import {
  ConflictException,
  Injectable,
  NotFoundException as HttpNotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Result } from '../../core/contracts';
import { BaseApplicationException, NotFoundException } from '../../core/exceptions';
import { PaginationService } from '../../platform/api/pagination/pagination.service';
import type {
  CreateNotificationDto,
  NotificationsQueryDto,
  RegisterDeviceTokenDto,
  SendSmsDto,
  UpdateNotificationDto,
} from './dto';
import { NotificationMapper } from './mappers/notification.mapper';
import { NOTIFICATIONS_EVENTS } from './constants/notifications.constants';
import {
  NotificationCreatedEvent,
  NotificationDeletedEvent,
  NotificationUpdatedEvent,
} from './events';
import { CreateNotificationUseCase } from './use-cases/create-notification.usecase';
import { FindNotificationByIdUseCase } from './use-cases/find-notification-by-id.usecase';
import { FindAllNotificationsUseCase } from './use-cases/find-all-notifications.usecase';
import { UpdateNotificationUseCase } from './use-cases/update-notification.usecase';
import { SoftDeleteNotificationUseCase } from './use-cases/soft-delete-notification.usecase';
import { SendSmsUseCase } from './use-cases/send-sms.usecase';
import { DeviceTokensService } from './services/device-tokens.service';
import { DurableNotificationService } from './services/durable-notification.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { AuthUserPublic } from '../auth/auth.types';

@Injectable()
export class NotificationsService {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: CreateNotificationUseCase,
    private readonly findByIdUseCase: FindNotificationByIdUseCase,
    private readonly findAllUseCase: FindAllNotificationsUseCase,
    private readonly updateUseCase: UpdateNotificationUseCase,
    private readonly softDeleteUseCase: SoftDeleteNotificationUseCase,
    private readonly sendSmsUseCase: SendSmsUseCase,
    private readonly deviceTokens: DeviceTokensService,
    private readonly durable: DurableNotificationService,
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: CreateNotificationDto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(
      NOTIFICATIONS_EVENTS.CREATED,
      new NotificationCreatedEvent(entity.getId()),
    );
    return NotificationMapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return NotificationMapper.toResponse(this.unwrap(result));
  }

  public async findByIdForUser(user: AuthUserPublic, id: string) {
    const result = await this.findByIdUseCase.execute(id);
    const entity = this.unwrap(result);
    if (
      user.role !== 'ADMIN' &&
      user.role !== 'SUPER_ADMIN' &&
      entity.getUserId() !== user.id
    ) {
      throw new HttpNotFoundException('Notification not found');
    }
    return NotificationMapper.toResponse(entity);
  }

  public async findAll(query: NotificationsQueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({
      ...query,
      ...normalized,
    });
    const page = this.unwrap(result);
    return this.pagination.buildResult(
      NotificationMapper.toResponseList(page.items),
      {
        total: page.total,
        page: normalized.page,
        limit: normalized.limit,
      },
    );
  }

  public async findMine(userId: string, query: NotificationsQueryDto) {
    return this.findAll({ ...query, userId });
  }

  public async unreadCount(userId: string) {
    const count = await this.durable.countUnread(userId);
    return { count };
  }

  public async getPreferences(userId: string) {
    const notificationSoundEnabled =
      await this.durable.getSoundPreference(userId);
    return { notificationSoundEnabled };
  }

  public async updatePreferences(
    userId: string,
    body: { notificationSoundEnabled?: boolean },
  ) {
    if (typeof body.notificationSoundEnabled === 'boolean') {
      return this.durable.setSoundPreference(
        userId,
        body.notificationSoundEnabled,
      );
    }
    return this.getPreferences(userId);
  }

  public async markRead(userId: string, id: string) {
    const existing = await this.findByIdUseCase.execute(id);
    const entity = this.unwrap(existing);
    if (entity.getUserId() !== userId) {
      throw new HttpNotFoundException('Notification not found');
    }
    return this.update(id, { isRead: true });
  }

  public async markAllRead(userId: string) {
    await this.prisma.notifications.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true, read_at: new Date() },
    });
    return { ok: true };
  }

  public async update(id: string, dto: UpdateNotificationDto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(
      NOTIFICATIONS_EVENTS.UPDATED,
      new NotificationUpdatedEvent(entity.getId()),
    );
    return NotificationMapper.toResponse(entity);
  }

  public async updateForUser(
    user: AuthUserPublic,
    id: string,
    dto: UpdateNotificationDto,
  ) {
    const existing = await this.findByIdUseCase.execute(id);
    const entity = this.unwrap(existing);
    if (
      user.role !== 'ADMIN' &&
      user.role !== 'SUPER_ADMIN' &&
      entity.getUserId() !== user.id
    ) {
      throw new HttpNotFoundException('Notification not found');
    }
    // Non-admins may only toggle read state.
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return this.update(id, { isRead: dto.isRead });
    }
    return this.update(id, dto);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(
      NOTIFICATIONS_EVENTS.DELETED,
      new NotificationDeletedEvent(id),
    );
  }

  public async sendSms(dto: SendSmsDto, options?: { sync?: boolean }) {
    const result = await this.sendSmsUseCase.execute(dto, options);
    if (result.isFailure()) {
      throw new ServiceUnavailableException(String(result.getError()));
    }
    const value = result.getValue();
    this.events.emit(NOTIFICATIONS_EVENTS.SMS_SENT, value);
    return value;
  }

  public registerDeviceToken(userId: string, dto: RegisterDeviceTokenDto) {
    return this.deviceTokens.register({
      userId,
      token: dto.token,
      platform: dto.platform,
      deviceId: dto.deviceId,
    });
  }

  public unregisterDeviceToken(userId: string, token: string) {
    return this.deviceTokens.unregister(userId, token);
  }

  private unwrap<T, E>(result: Result<T, E>): T {
    if (result.isSuccess()) return result.getValue();
    const err = result.getError();
    if (err instanceof NotFoundException) {
      throw new HttpNotFoundException(err.message);
    }
    if (err instanceof BaseApplicationException) {
      throw new UnprocessableEntityException(err.message);
    }
    throw new ConflictException(String(err));
  }
}
