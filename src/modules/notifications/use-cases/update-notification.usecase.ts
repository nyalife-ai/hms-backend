/**
 * File: update-notification.usecase.ts
 * Module: notifications
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateNotificationDto } from '../dto';
import type { Notification } from '../domain/notification.entity';
import { NOTIFICATIONS_REPOSITORY } from '../constants/notifications.constants';
import type { INotificationRepository } from '../interfaces/notification-repository.interface';

@Injectable()
export class UpdateNotificationUseCase {
  public constructor(
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: INotificationRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateNotificationDto,
  ): Promise<Result<Notification, NotFoundException | string>> {
    try {
      const saved = await this.repository.applyUpdate(id, dto);
      if (!saved) {
        return Result.failure(new NotFoundException('Notification', id));
      }
      return Result.success(saved);
    } catch (err) {
      return Result.failure(
        err instanceof Error ? err.message : 'Update failed',
      );
    }
  }
}
