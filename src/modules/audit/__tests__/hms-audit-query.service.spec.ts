/**
 * Unit tests — admin audit log query service (list / detail / actors).
 */

import { NotFoundException } from '@nestjs/common';
import { HmsAuditQueryService } from '../hms-audit-query.service';

describe('HmsAuditQueryService', () => {
  const user = {
    id: 'u-1',
    email: 'admin@nyalife.health',
    core_profiles_user_id: [{ first_name: 'Ada', last_name: 'Admin' }],
  };

  const row = {
    id: 'log-1',
    action: 'UPDATE',
    entity_type: 'OutpatientVisits',
    entity_id: '00000000-0000-4000-8000-000000000099',
    user_id: 'u-1',
    ip_address: '127.0.0.1',
    user_agent: 'jest',
    created_at: new Date('2026-08-09T04:00:00.000Z'),
    old_values: { stage: 'CHECKED_IN', phone: '***78' },
    new_values: {
      stage: 'WAITING_DOCTOR',
      phone: '***78',
      __changedFields: [
        { field: 'stage', from: 'CHECKED_IN', to: 'WAITING_DOCTOR' },
      ],
    },
    user,
  };

  it('lists logs with pagination and maps actor + changed preview', async () => {
    const count = jest.fn().mockResolvedValue(1);
    const findMany = jest.fn().mockResolvedValue([row]);
    const prisma = {
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
      auditLogs: { count, findMany },
    } as any;

    const service = new HmsAuditQueryService(prisma);
    const res = await service.list({
      page: 1,
      limit: 25,
      action: 'UPDATE',
      userId: 'u-1',
      search: 'Outpatient',
    });

    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      id: 'log-1',
      action: 'UPDATE',
      entityType: 'OutpatientVisits',
      userEmail: 'admin@nyalife.health',
      userName: 'Ada Admin',
      changedFieldCount: 1,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: 'UPDATE',
          user_id: 'u-1',
        }),
      }),
    );
  });

  it('returns detail with stripped meta and full changed fields', async () => {
    const findUnique = jest.fn().mockResolvedValue(row);
    const prisma = {
      auditLogs: { findUnique },
    } as any;

    const service = new HmsAuditQueryService(prisma);
    const detail = await service.findById('log-1');

    expect(detail.changedFields).toEqual([
      { field: 'stage', from: 'CHECKED_IN', to: 'WAITING_DOCTOR' },
    ]);
    expect(detail.oldValues).toEqual({ stage: 'CHECKED_IN', phone: '***78' });
    expect(detail.newValues).toEqual({
      stage: 'WAITING_DOCTOR',
      phone: '***78',
    });
    expect(detail.newValues).not.toHaveProperty('__changedFields');
  });

  it('throws NotFoundException for missing log', async () => {
    const prisma = {
      auditLogs: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new HmsAuditQueryService(prisma);
    await expect(service.findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists distinct actors from audit logs', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { user_id: 'u-1', user },
      { user_id: 'u-2', user: null },
    ]);
    const prisma = { auditLogs: { findMany } } as any;
    const service = new HmsAuditQueryService(prisma);
    const actors = await service.listActors();
    expect(actors).toEqual([
      {
        id: 'u-1',
        email: 'admin@nyalife.health',
        name: 'Ada Admin',
      },
    ]);
  });
});
