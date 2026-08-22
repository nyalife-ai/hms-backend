/**
 * Persist durable in-app notification rows before channel delivery.
 * Idempotent on idempotency_key (eventId:userId:notificationType).
 */

import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from '../../../common/security/encryption.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import type { DurableNotificationSpec } from '../jobs/notification.jobs';

export type PersistedDurableNotification = {
  id: string;
  userId: string;
  notificationType: string;
  title: string;
  body: string | null;
  priority: string;
  actionPath: string | null;
  entityType: string | null;
  entityId: string | null;
  created: boolean;
  idempotencyKey: string;
};

@Injectable()
export class DurableNotificationService {
  private readonly logger = new Logger(DurableNotificationService.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Create notification rows for each durable spec.
   * Duplicate idempotency keys return the existing row (created=false).
   */
  public async persistMany(
    specs: readonly DurableNotificationSpec[],
  ): Promise<PersistedDurableNotification[]> {
    const out: PersistedDurableNotification[] = [];
    for (const spec of specs) {
      out.push(await this.persistOne(spec));
    }
    return out;
  }

  public async persistOne(
    spec: DurableNotificationSpec,
  ): Promise<PersistedDurableNotification> {
    const existing = await this.prisma.notifications.findUnique({
      where: { idempotency_key: spec.idempotencyKey },
    });
    if (existing) {
      return {
        id: existing.id,
        userId: existing.user_id,
        notificationType: existing.notification_type,
        title: existing.title,
        body: this.decryptBody(existing.encrypted_body),
        priority: existing.priority,
        actionPath: existing.action_path,
        entityType: existing.entity_type,
        entityId: existing.entity_id,
        created: false,
        idempotencyKey: spec.idempotencyKey,
      };
    }

    const encryptedBody = spec.body
      ? this.encryption.encryptPayload(spec.body)
      : null;

    try {
      const row = await this.prisma.notifications.create({
        data: {
          user_id: spec.userId,
          notification_type: spec.notificationType.slice(0, 50),
          title: spec.title.slice(0, 255),
          encrypted_body: encryptedBody,
          priority: spec.priority ?? 'NORMAL',
          is_read: false,
          idempotency_key: spec.idempotencyKey,
          entity_type: spec.entityType ?? null,
          entity_id: spec.entityId ?? null,
          action_path: spec.actionPath ?? null,
          delivery_status: 'QUEUED',
        },
      });
      return {
        id: row.id,
        userId: row.user_id,
        notificationType: row.notification_type,
        title: row.title,
        body: spec.body ?? null,
        priority: row.priority,
        actionPath: row.action_path,
        entityType: row.entity_type,
        entityId: row.entity_id,
        created: true,
        idempotencyKey: spec.idempotencyKey,
      };
    } catch (err) {
      // Race: unique constraint — re-read
      const raced = await this.prisma.notifications.findUnique({
        where: { idempotency_key: spec.idempotencyKey },
      });
      if (raced) {
        return {
          id: raced.id,
          userId: raced.user_id,
          notificationType: raced.notification_type,
          title: raced.title,
          body: this.decryptBody(raced.encrypted_body),
          priority: raced.priority,
          actionPath: raced.action_path,
          entityType: raced.entity_type,
          entityId: raced.entity_id,
          created: false,
          idempotencyKey: spec.idempotencyKey,
        };
      }
      this.logger.warn(
        `Durable persist failed key=${spec.idempotencyKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }

  public async markWsDelivered(notificationId: string): Promise<void> {
    await this.prisma.notifications.updateMany({
      where: { id: notificationId },
      data: {
        ws_delivered_at: new Date(),
        delivery_status: 'DELIVERED',
      },
    });
  }

  public async markDeliveryFailed(notificationId: string): Promise<void> {
    await this.prisma.notifications.updateMany({
      where: {
        id: notificationId,
        delivery_status: { in: ['QUEUED', 'PARTIAL'] },
      },
      data: { delivery_status: 'FAILED' },
    });
  }

  public async markChannelPartial(notificationId: string): Promise<void> {
    await this.prisma.notifications.updateMany({
      where: { id: notificationId, delivery_status: 'QUEUED' },
      data: { delivery_status: 'PARTIAL' },
    });
  }

  public async countUnread(userId: string): Promise<number> {
    return this.prisma.notifications.count({
      where: { user_id: userId, is_read: false },
    });
  }

  public async getSoundPreference(userId: string): Promise<boolean> {
    const profile = await this.prisma.profiles.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { notification_sound_enabled: true },
    });
    return profile?.notification_sound_enabled ?? true;
  }

  public async setSoundPreference(
    userId: string,
    enabled: boolean,
  ): Promise<{ notificationSoundEnabled: boolean }> {
    const existing = await this.prisma.profiles.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    });
    if (!existing) {
      return { notificationSoundEnabled: enabled };
    }
    await this.prisma.profiles.update({
      where: { id: existing.id },
      data: { notification_sound_enabled: enabled },
    });
    return { notificationSoundEnabled: enabled };
  }

  private decryptBody(encrypted: string | null): string | null {
    if (!encrypted) return null;
    try {
      return this.encryption.decryptPayload(encrypted);
    } catch {
      return encrypted;
    }
  }
}
