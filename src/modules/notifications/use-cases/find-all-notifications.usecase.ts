/**
 * File: find-all-notifications.usecase.ts
 * Module: notifications
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { NotificationsQueryDto } from '../dto';
import { NOTIFICATIONS_REPOSITORY } from '../constants/notifications.constants';
import type {
  INotificationRepository,
  NotificationPage,
} from '../interfaces/notification-repository.interface';

@Injectable()
export class FindAllNotificationsUseCase {
  public constructor(
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: INotificationRepository,
  ) {}

  public async execute(
    query: NotificationsQueryDto,
  ): Promise<Result<NotificationPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(
        err instanceof Error ? err.message : 'List failed',
      );
    }
  }
}
