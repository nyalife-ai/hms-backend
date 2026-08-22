/**
 * File: prisma-notification.repository.ts
 * Module: notifications
 * Purpose: Prisma adapter for communications.notifications.
 */

import { Injectable } from '@nestjs/common';
import { EncryptionService } from '../../../../common/security/encryption.service';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  CreateNotificationDto,
  NotificationsQueryDto,
  UpdateNotificationDto,
} from '../../dto';
import { Notification } from '../../domain/notification.entity';
import type {
  INotificationRepository,
  NotificationPage,
} from '../../interfaces/notification-repository.interface';

type NotificationRow = {
  id: string;
  user_id: string;
  notification_type: string;
  title: string;
  encrypted_body: string | null;
  priority: string;
  is_read: boolean;
  read_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  entity_type?: string | null;
  entity_id?: string | null;
  action_path?: string | null;
  delivery_status?: string;
  ws_delivered_at?: Date | null;
  idempotency_key?: string | null;
};

@Injectable()
export class PrismaNotificationRepository implements INotificationRepository {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  public async save(entity: Notification): Promise<Notification> {
    const encryptedBody = entity.getBody()
      ? this.encryption.encryptPayload(entity.getBody()!)
      : null;

    await this.prisma.notifications.upsert({
      where: { id: entity.getId() },
      create: {
        id: entity.getId(),
        user_id: entity.getUserId(),
        notification_type: entity.getNotificationType(),
        title: entity.getTitle(),
        encrypted_body: encryptedBody,
        priority: entity.getPriority(),
        is_read: entity.getIsRead(),
        read_at: entity.getReadAt() ?? null,
        expires_at: entity.getExpiresAt() ?? null,
        created_at: entity.getCreatedAt(),
      },
      update: {
        title: entity.getTitle(),
        encrypted_body: encryptedBody,
        priority: entity.getPriority(),
        is_read: entity.getIsRead(),
        read_at: entity.getReadAt() ?? null,
        expires_at: entity.getExpiresAt() ?? null,
      },
    });

    const refreshed = await this.findById(entity.getId());
    if (!refreshed) throw new Error('Notification missing after save');
    return refreshed;
  }

  public async createFromDto(dto: CreateNotificationDto): Promise<Notification> {
    const entity = Notification.create({
      userId: dto.userId,
      notificationType: dto.notificationType,
      title: dto.title,
      body: dto.body,
      priority: dto.priority,
      isRead: dto.isRead,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    return this.save(entity);
  }

  public async applyUpdate(
    id: string,
    dto: UpdateNotificationDto,
  ): Promise<Notification | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    existing.update({
      title: dto.title,
      body: dto.body,
      priority: dto.priority,
      isRead: dto.isRead,
      expiresAt:
        dto.expiresAt === undefined
          ? undefined
          : dto.expiresAt
            ? new Date(dto.expiresAt)
            : null,
    });
    return this.save(existing);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.notifications.delete({ where: { id } });
  }

  public async findById(id: string): Promise<Notification | null> {
    const row = await this.prisma.notifications.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Notification[]> {
    const rows = await this.prisma.notifications.findMany({
      orderBy: { created_at: 'desc' },
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    const count = await this.prisma.notifications.count({ where: { id } });
    return count > 0;
  }

  public async findMany(query: NotificationsQueryDto): Promise<NotificationPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      ...(query.userId ? { user_id: query.userId } : {}),
      ...(query.notificationType
        ? { notification_type: query.notificationType }
        : {}),
      ...(query.isRead !== undefined ? { is_read: query.isRead } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notifications.count({ where }),
      this.prisma.notifications.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.delete(id);
  }

  private toDomain(row: NotificationRow): Notification {
    let body: string | null = null;
    if (row.encrypted_body) {
      try {
        body = this.encryption.decryptPayload(row.encrypted_body);
      } catch {
        body = row.encrypted_body;
      }
    }
    return Notification.reconstitute(
      row.id,
      {
        userId: row.user_id,
        notificationType: row.notification_type,
        title: row.title,
        body,
        priority: row.priority,
        isRead: row.is_read,
        readAt: row.read_at,
        expiresAt: row.expires_at,
        entityType: row.entity_type ?? null,
        entityId: row.entity_id ?? null,
        actionPath: row.action_path ?? null,
        deliveryStatus: row.delivery_status ?? 'QUEUED',
        wsDeliveredAt: row.ws_delivered_at ?? null,
        idempotencyKey: row.idempotency_key ?? null,
      },
      row.created_at,
      row.created_at,
    );
  }
}
