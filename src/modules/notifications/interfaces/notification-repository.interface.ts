/**
 * File: notification-repository.interface.ts
 * Module: notifications
 * Purpose: Repository port (core Repository + pagination).
 */

import type { Repository } from '../../../core/contracts';
import type { Notification } from '../domain/notification.entity';
import type {
  CreateNotificationDto,
  NotificationsQueryDto,
  UpdateNotificationDto,
} from '../dto';

export type NotificationPage = { items: Notification[]; total: number };

export interface INotificationRepository extends Repository<Notification, string> {
  findMany(query: NotificationsQueryDto): Promise<NotificationPage>;
  /** Hard-delete — communications.notifications has no soft-delete column. */
  softDelete(id: string): Promise<void>;
  createFromDto(dto: CreateNotificationDto): Promise<Notification>;
  applyUpdate(
    id: string,
    dto: UpdateNotificationDto,
  ): Promise<Notification | null>;
}
