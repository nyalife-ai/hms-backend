/**
 * P1 DurableNotificationService against Postgres :5433 —
 * persist before delivery contract at the DB layer (idempotency + delivery marks).
 */

import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../../common/security/encryption.service';
import type { PrismaClient } from '../../../generated/prisma';
import { DurableNotificationService } from '../services/durable-notification.service';
import {
  asConnectedPrisma,
  cleanupAuthUser,
  createTestPrisma,
  seedAuthUser,
} from '../../auth/__tests__/p0-test-helpers';

describe('P1 DurableNotificationService (Postgres :5433)', () => {
  let prisma: PrismaClient;
  let durable: DurableNotificationService;
  let userId = '';
  const entityId = randomUUID();

  beforeAll(async () => {
    prisma = await createTestPrisma();
    const seeded = await seedAuthUser(prisma);
    userId = seeded.id;

    const encryption = new EncryptionService({
      get: (key: string) =>
        key === 'ENCRYPTION_SECRET_KEY' || key === 'encryption.secretKey'
          ? process.env.ENCRYPTION_SECRET_KEY ||
            'nyalife-test-encrypt-key-32ch!!'
          : undefined,
    } as unknown as ConfigService);

    durable = new DurableNotificationService(
      asConnectedPrisma(prisma) as never,
      encryption,
    );
  });

  afterAll(async () => {
    if (userId) {
      await prisma.notifications.deleteMany({ where: { user_id: userId } });
      await cleanupAuthUser(prisma, userId);
    }
    await prisma.$disconnect();
  });

  it('persistMany creates QUEUED row then idempotent re-persist returns created=false', async () => {
    const key = `p1-durable:${userId}:laboratory.request_created`;
    const first = await durable.persistMany([
      {
        userId,
        notificationType: 'laboratory.request_created',
        title: 'New laboratory request',
        body: 'A new laboratory request is waiting.',
        priority: 'NORMAL',
        entityType: 'laboratory_request',
        entityId,
        actionPath: '/laboratory',
        idempotencyKey: key,
      },
    ]);

    expect(first).toHaveLength(1);
    expect(first[0].created).toBe(true);
    expect(first[0].id).toBeTruthy();

    const row = await prisma.notifications.findUnique({
      where: { idempotency_key: key },
    });
    expect(row?.delivery_status).toBe('QUEUED');
    expect(row?.user_id).toBe(userId);

    const second = await durable.persistMany([
      {
        userId,
        notificationType: 'laboratory.request_created',
        title: 'New laboratory request',
        body: 'A new laboratory request is waiting.',
        idempotencyKey: key,
      },
    ]);
    expect(second[0].created).toBe(false);
    expect(second[0].id).toBe(first[0].id);

    const count = await prisma.notifications.count({
      where: { idempotency_key: key },
    });
    expect(count).toBe(1);
  });

  it('markChannelPartial then markDeliveryFailed update delivery_status', async () => {
    const key = `p1-durable-mark:${userId}:appointment.created`;
    const [row] = await durable.persistMany([
      {
        userId,
        notificationType: 'appointment.created',
        title: 'New appointment',
        body: 'Scheduled.',
        idempotencyKey: key,
        entityType: 'appointment',
        entityId,
        actionPath: '/appointments',
      },
    ]);

    await durable.markChannelPartial(row.id);
    let db = await prisma.notifications.findUnique({ where: { id: row.id } });
    expect(db?.delivery_status).toBe('PARTIAL');

    // PARTIAL → FAILED is not allowed by markDeliveryFailed (only QUEUED|PARTIAL wait — PARTIAL is allowed)
    await durable.markDeliveryFailed(row.id);
    db = await prisma.notifications.findUnique({ where: { id: row.id } });
    expect(db?.delivery_status).toBe('FAILED');
  });

  it('markWsDelivered sets DELIVERED', async () => {
    const key = `p1-durable-ws:${userId}:appointment.checked_in`;
    const [row] = await durable.persistMany([
      {
        userId,
        notificationType: 'appointment.checked_in',
        title: 'Checked in',
        body: 'Ready.',
        idempotencyKey: key,
      },
    ]);

    await durable.markWsDelivered(row.id);
    const db = await prisma.notifications.findUnique({ where: { id: row.id } });
    expect(db?.delivery_status).toBe('DELIVERED');
    expect(db?.ws_delivered_at).toBeTruthy();
  });
});
