/**
 * File: notification.mapper.ts
 * Module: notifications
 * Purpose: Entity ↔ DTO mapper.
 */

import type { Notification } from '../domain/notification.entity';
import type { NotificationResponseDto } from '../dto';

export class NotificationMapper {
  public static toResponse(entity: Notification): NotificationResponseDto {
    return {
      id: entity.getId(),
      userId: entity.getUserId(),
      notificationType: entity.getNotificationType(),
      title: entity.getTitle(),
      body: entity.getBody() ?? null,
      priority: entity.getPriority(),
      isRead: entity.getIsRead(),
      readAt: entity.getReadAt() ?? null,
      expiresAt: entity.getExpiresAt() ?? null,
      entityType: entity.getEntityType() ?? null,
      entityId: entity.getEntityId() ?? null,
      actionPath: entity.getActionPath() ?? null,
      deliveryStatus: entity.getDeliveryStatus(),
      wsDeliveredAt: entity.getWsDeliveredAt() ?? null,
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(
    items: readonly Notification[],
  ): NotificationResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
