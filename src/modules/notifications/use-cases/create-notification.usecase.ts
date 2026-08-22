/**
 * File: create-notification.usecase.ts
 * Module: notifications
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateNotificationDto } from '../dto';
import { Notification } from '../domain/notification.entity';
import { NOTIFICATIONS_REPOSITORY } from '../constants/notifications.constants';
import type { INotificationRepository } from '../interfaces/notification-repository.interface';

@Injectable()
export class CreateNotificationUseCase {
  public constructor(
    @Inject(NOTIFICATIONS_REPOSITORY)
    private readonly repository: INotificationRepository,
  ) {}

  public async execute(
    dto: CreateNotificationDto,
  ): Promise<Result<Notification, string>> {
    try {
      const saved = await this.repository.createFromDto(dto);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(
        err instanceof Error ? err.message : 'Create failed',
      );
    }
  }
}
