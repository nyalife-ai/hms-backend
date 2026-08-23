/**
 * PrismaNotificationRepository — upsert/query/delete with Prisma + encryption mocks.
 */

import { PrismaNotificationRepository } from '../repositories/prisma/prisma-notification.repository';
import { Notification } from '../domain/notification.entity';

describe('PrismaNotificationRepository', () => {
  const now = new Date('2026-03-01T12:00:00Z');

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'n1',
      user_id: 'u1',
      notification_type: 'INFO',
      title: 'Hello',
      encrypted_body: 'enc:body',
      priority: 'NORMAL',
      is_read: false,
      read_at: null,
      expires_at: null,
      created_at: now,
      entity_type: 'visit',
      entity_id: 'v1',
      action_path: '/visits/v1',
      delivery_status: 'QUEUED',
      ws_delivered_at: null,
      idempotency_key: 'idem-1',
      ...overrides,
    };
  }

  let prisma: Record<string, any>;
  let encryption: { encryptPayload: jest.Mock; decryptPayload: jest.Mock };
  let repo: PrismaNotificationRepository;

  beforeEach(() => {
    encryption = {
      encryptPayload: jest.fn((v: string) => `enc:${v}`),
      decryptPayload: jest.fn((v: string) =>
        v.startsWith('enc:') ? v.slice(4) : v,
      ),
    };
    prisma = {
      notifications: {
        upsert: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([row()]),
        delete: jest.fn().mockResolvedValue(undefined),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
    repo = new PrismaNotificationRepository(
      prisma as never,
      encryption as never,
    );
  });

  it('saves entity with encrypted body and reloads', async () => {
    const entity = Notification.create({
      id: 'n1',
      userId: 'u1',
      notificationType: 'INFO',
      title: 'Hello',
      body: 'plain',
    });
    const saved = await repo.save(entity);
    expect(encryption.encryptPayload).toHaveBeenCalledWith('plain');
    expect(prisma.notifications.upsert).toHaveBeenCalled();
    expect(saved.getBody()).toBe('body');
  });

  it('saves null body without encrypting', async () => {
    prisma.notifications.findUnique.mockResolvedValueOnce(
      row({ encrypted_body: null }),
    );
    const entity = Notification.create({
      id: 'n2',
      userId: 'u1',
      notificationType: 'INFO',
      title: 'No body',
      body: null,
    });
    const saved = await repo.save(entity);
    expect(encryption.encryptPayload).not.toHaveBeenCalled();
    expect(saved.getBody()).toBeNull();
  });

  it('throws when findById misses after save', async () => {
    prisma.notifications.findUnique.mockResolvedValueOnce(null);
    const entity = Notification.create({
      userId: 'u1',
      notificationType: 'INFO',
      title: 'X',
    });
    await expect(repo.save(entity)).rejects.toThrow(
      'Notification missing after save',
    );
  });

  it('createFromDto builds entity and saves', async () => {
    const saved = await repo.createFromDto({
      userId: 'u1',
      notificationType: 'ALERT',
      title: 'T',
      body: 'B',
      priority: 'HIGH',
      expiresAt: '2026-12-31T00:00:00Z',
    } as never);
    expect(saved.getTitle()).toBe('Hello');
    expect(prisma.notifications.upsert).toHaveBeenCalled();
  });

  it('applyUpdate returns null when missing; updates when found', async () => {
    prisma.notifications.findUnique.mockResolvedValueOnce(null);
    expect(await repo.applyUpdate('missing', { title: 'x' } as never)).toBeNull();

    prisma.notifications.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ title: 'Updated', is_read: true }));
    const updated = await repo.applyUpdate('n1', {
      title: 'Updated',
      isRead: true,
      expiresAt: null,
    } as never);
    expect(updated?.getTitle()).toBe('Updated');

    prisma.notifications.findUnique
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ expires_at: new Date('2027-01-01') }));
    await repo.applyUpdate('n1', {
      expiresAt: '2027-01-01T00:00:00Z',
    } as never);
  });

  it('delete, softDelete, findAll, exists, findById null', async () => {
    await repo.delete('n1');
    expect(prisma.notifications.delete).toHaveBeenCalledWith({
      where: { id: 'n1' },
    });

    await repo.softDelete('n1');
    expect(prisma.notifications.delete).toHaveBeenCalledTimes(2);

    const all = await repo.findAll();
    expect(all).toHaveLength(1);

    expect(await repo.exists('n1')).toBe(true);
    prisma.notifications.count.mockResolvedValueOnce(0);
    expect(await repo.exists('x')).toBe(false);

    prisma.notifications.findUnique.mockResolvedValueOnce(null);
    expect(await repo.findById('missing')).toBeNull();
  });

  it('findMany filters and paginates', async () => {
    prisma.notifications.count.mockResolvedValueOnce(1);
    prisma.notifications.findMany.mockResolvedValueOnce([row()]);
    const page = await repo.findMany({
      page: 2,
      limit: 5,
      userId: 'u1',
      notificationType: 'INFO',
      isRead: false,
    } as never);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('toDomain falls back to raw body when decrypt fails', async () => {
    encryption.decryptPayload.mockImplementationOnce(() => {
      throw new Error('bad cipher');
    });
    prisma.notifications.findUnique.mockResolvedValueOnce(
      row({ encrypted_body: 'raw-cipher' }),
    );
    const found = await repo.findById('n1');
    expect(found?.getBody()).toBe('raw-cipher');
  });
});
