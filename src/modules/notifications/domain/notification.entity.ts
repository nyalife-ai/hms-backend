/**
 * File: notification.entity.ts
 * Module: notifications
 * Purpose: Domain entity aligned with communications.notifications (Prisma).
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../core/domain';

export type NotificationProps = {
  userId: string;
  notificationType: string;
  title: string;
  body?: string | null;
  priority?: string;
  isRead?: boolean;
  readAt?: Date | null;
  expiresAt?: Date | null;
  entityType?: string | null;
  entityId?: string | null;
  actionPath?: string | null;
  deliveryStatus?: string;
  wsDeliveredAt?: Date | null;
  idempotencyKey?: string | null;
};

export class Notification extends Entity<string> {
  private constructor(
    id: string,
    private props: NotificationProps,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
  }

  public static create(
    input: NotificationProps & { id?: string },
  ): Notification {
    const now = new Date();
    return new Notification(
      input.id ?? randomUUID(),
      {
        userId: input.userId,
        notificationType: input.notificationType,
        title: input.title.trim(),
        body: input.body ?? null,
        priority: input.priority ?? 'NORMAL',
        isRead: input.isRead ?? false,
        readAt: input.readAt ?? null,
        expiresAt: input.expiresAt ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        actionPath: input.actionPath ?? null,
        deliveryStatus: input.deliveryStatus ?? 'QUEUED',
        wsDeliveredAt: input.wsDeliveredAt ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: NotificationProps,
    createdAt: Date,
    updatedAt: Date,
  ): Notification {
    return new Notification(id, { ...props }, createdAt, updatedAt);
  }

  public update(
    patch: Partial<
      Pick<
        NotificationProps,
        'title' | 'body' | 'priority' | 'isRead' | 'readAt' | 'expiresAt'
      >
    >,
  ): void {
    this.props = {
      ...this.props,
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() : this.props.title,
    };
    if (patch.isRead === true && !this.props.readAt) {
      this.props.readAt = new Date();
    }
    if (patch.isRead === false) {
      this.props.readAt = null;
    }
    this.touch();
  }

  public getUserId(): string {
    return this.props.userId;
  }
  public getNotificationType(): string {
    return this.props.notificationType;
  }
  public getTitle(): string {
    return this.props.title;
  }
  public getBody(): string | null | undefined {
    return this.props.body;
  }
  public getPriority(): string {
    return this.props.priority ?? 'NORMAL';
  }
  public getIsRead(): boolean {
    return this.props.isRead ?? false;
  }
  public getReadAt(): Date | null | undefined {
    return this.props.readAt;
  }
  public getExpiresAt(): Date | null | undefined {
    return this.props.expiresAt;
  }
  public getEntityType(): string | null | undefined {
    return this.props.entityType;
  }
  public getEntityId(): string | null | undefined {
    return this.props.entityId;
  }
  public getActionPath(): string | null | undefined {
    return this.props.actionPath;
  }
  public getDeliveryStatus(): string {
    return this.props.deliveryStatus ?? 'QUEUED';
  }
  public getWsDeliveredAt(): Date | null | undefined {
    return this.props.wsDeliveredAt;
  }
}
