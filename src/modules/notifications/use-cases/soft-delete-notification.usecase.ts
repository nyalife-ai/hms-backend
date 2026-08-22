/**
 * File: soft-delete-notification.usecase.ts
 * Module: notifications
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { NOTIFICATIONS_REPOSITORY } from '../constants/notifications.constants';
import type { INotificationRepository } from '../interfaces/notification-repository.interface';

@Injectable()
export class SoftDeleteNotificationUseCase {
  public constructor(
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: INotificationRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Notification', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
