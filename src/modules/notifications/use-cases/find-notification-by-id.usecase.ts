/**
 * File: find-notification-by-id.usecase.ts
 * Module: notifications
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { Notification } from '../domain/notification.entity';
import { NOTIFICATIONS_REPOSITORY } from '../constants/notifications.constants';
import type { INotificationRepository } from '../interfaces/notification-repository.interface';

@Injectable()
export class FindNotificationByIdUseCase {
  public constructor(
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: INotificationRepository,
  ) {}

  public async execute(
    id: string,
  ): Promise<Result<Notification, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Notification', id));
    }
    return Result.success(entity);
  }
}
