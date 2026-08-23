/**
 * Prisma audit middleware — CREATE/UPDATE/DELETE audit trails with mocks.
 */

import { runWithAuditContext } from '../audit-request.context';
import {
  PRISMA_AUDIT_WRITE_ACTIONS,
  registerPrismaAuditMiddleware,
} from '../prisma-audit.middleware';

describe('registerPrismaAuditMiddleware', () => {
  const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  let middleware: (params: any, next: (p: any) => Promise<any>) => Promise<any>;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      isConnected: true,
      $use: jest.fn((fn: typeof middleware) => {
        middleware = fn;
      }),
      auditLogs: { create: jest.fn().mockResolvedValue({}) },
      patients: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };
    registerPrismaAuditMiddleware(prisma);
  });

  it('registers a $use middleware', () => {
    expect(prisma.$use).toHaveBeenCalledTimes(1);
    expect(middleware).toBeDefined();
  });

  it('passthrough skips AuditLogs, AccessLogs, reads, skipDepth, and disconnected', async () => {
    const next = jest.fn().mockResolvedValue('ok');

    await middleware({ model: 'AuditLogs', action: 'create' }, next);
    await middleware({ model: 'AccessLogs', action: 'update' }, next);
    await middleware({ model: 'Patients', action: 'findMany' }, next);
    await middleware({ model: undefined, action: 'create' }, next);

    prisma.isConnected = false;
    await middleware({ model: 'Patients', action: 'create' }, next);
    prisma.isConnected = true;

    await runWithAuditContext({ skipDepth: 1 }, async () => {
      await middleware({ model: 'Patients', action: 'create' }, next);
    });

    expect(next).toHaveBeenCalledTimes(6);
    expect(prisma.auditLogs.create).not.toHaveBeenCalled();
  });

  it('audits create with UUID entity id and request context', async () => {
    const result = { id: UUID, name: 'Amina', password: 'secret' };
    const next = jest.fn().mockResolvedValue(result);

    await runWithAuditContext(
      {
        skipDepth: 0,
        userId: 'user-1',
        ipAddress: '10.0.0.1',
        userAgent: 'jest',
      },
      async () => {
        const out = await middleware(
          { model: 'Patients', action: 'create', args: { data: {} } },
          next,
        );
        expect(out).toBe(result);
      },
    );

    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'user-1',
          action: 'CREATE',
          entity_type: 'Patients',
          entity_id: UUID,
          ip_address: '10.0.0.1',
          user_agent: 'jest',
        }),
      }),
    );
    const payload = prisma.auditLogs.create.mock.calls[0][0].data;
    expect(payload.new_values.password).toBe('***');
    expect(payload.new_values.__changedFields).toBeDefined();
  });

  it('audits createMany and hashes non-UUID ids on create', async () => {
    const nextMany = jest.fn().mockResolvedValue({ count: 2 });
    await middleware(
      {
        model: 'Patients',
        action: 'createMany',
        args: { data: [{ name: 'a' }, { name: 'b' }] },
      },
      nextMany,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          new_values: expect.objectContaining({ count: 2 }),
        }),
      }),
    );

    prisma.auditLogs.create.mockClear();
    const next = jest.fn().mockResolvedValue({ id: 'MRN-1', name: 'x' });
    await middleware({ model: 'Patients', action: 'create', args: {} }, next);
    const entityId = prisma.auditLogs.create.mock.calls[0][0].data.entity_id;
    expect(entityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('audits update with old→new and falls back when findUnique fails', async () => {
    prisma.patients.findUnique.mockResolvedValue({ id: UUID, stage: 'A' });
    const next = jest.fn().mockResolvedValue({ id: UUID, stage: 'B' });
    await middleware(
      {
        model: 'Patients',
        action: 'update',
        args: { where: { id: UUID }, data: { stage: 'B' } },
      },
      next,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          entity_id: UUID,
          old_values: expect.objectContaining({ stage: 'A' }),
          new_values: expect.objectContaining({ stage: 'B' }),
        }),
      }),
    );

    prisma.auditLogs.create.mockClear();
    prisma.patients.findUnique.mockRejectedValue(new Error('boom'));
    const next2 = jest.fn().mockResolvedValue(null);
    await middleware(
      {
        model: 'Patients',
        action: 'update',
        args: { where: { id: UUID }, data: { stage: 'C' } },
      },
      next2,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          new_values: expect.objectContaining({ stage: 'C' }),
        }),
      }),
    );
  });

  it('audits upsert as CREATE or UPDATE depending on prior row', async () => {
    prisma.patients.findUnique.mockResolvedValue(null);
    const next = jest.fn().mockResolvedValue({ id: UUID, name: 'new' });
    await middleware(
      { model: 'Patients', action: 'upsert', args: { where: { id: UUID } } },
      next,
    );
    expect(prisma.auditLogs.create.mock.calls[0][0].data.action).toBe('CREATE');

    prisma.auditLogs.create.mockClear();
    prisma.patients.findUnique.mockResolvedValue({ id: UUID, name: 'old' });
    await middleware(
      { model: 'Patients', action: 'upsert', args: { where: { id: UUID } } },
      next,
    );
    expect(prisma.auditLogs.create.mock.calls[0][0].data.action).toBe('UPDATE');

    prisma.auditLogs.create.mockClear();
    prisma.patients.findUnique.mockRejectedValue(new Error('x'));
    await middleware(
      { model: 'Patients', action: 'upsert', args: { where: { id: UUID } } },
      next,
    );
    expect(prisma.auditLogs.create.mock.calls[0][0].data.action).toBe('CREATE');
  });

  it('audits delete and deleteMany with before snapshots', async () => {
    prisma.patients.findUnique.mockResolvedValue({ id: UUID, name: 'gone' });
    const nextDel = jest.fn().mockResolvedValue({ id: UUID });
    await middleware(
      { model: 'Patients', action: 'delete', args: { where: { id: UUID } } },
      nextDel,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DELETE',
          entity_id: UUID,
          new_values: expect.objectContaining({ __changedFields: expect.any(Object) }),
        }),
      }),
    );

    prisma.auditLogs.create.mockClear();
    prisma.patients.findUnique.mockRejectedValue(new Error('x'));
    await middleware(
      { model: 'Patients', action: 'delete', args: { where: { id: UUID } } },
      nextDel,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalled();

    prisma.auditLogs.create.mockClear();
    prisma.patients.findMany.mockResolvedValue([
      { id: UUID, name: 'a' },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'b' },
    ]);
    const nextMany = jest.fn().mockResolvedValue({ count: 2 });
    await middleware(
      { model: 'Patients', action: 'deleteMany', args: { where: { active: false } } },
      nextMany,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalledTimes(2);

    prisma.auditLogs.create.mockClear();
    prisma.patients.findMany.mockRejectedValue(new Error('x'));
    await middleware(
      { model: 'Patients', action: 'deleteMany', args: { where: {} } },
      nextMany,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DELETE' }),
      }),
    );
  });

  it('audits updateMany per row or synthetic when empty', async () => {
    prisma.patients.findMany.mockResolvedValue([{ id: UUID, stage: 'A' }]);
    const next = jest.fn().mockResolvedValue({ count: 1 });
    await middleware(
      {
        model: 'Patients',
        action: 'updateMany',
        args: { where: {}, data: { stage: 'B' } },
      },
      next,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          new_values: expect.objectContaining({ stage: 'B' }),
        }),
      }),
    );

    prisma.auditLogs.create.mockClear();
    prisma.patients.findMany.mockResolvedValue([]);
    await middleware(
      {
        model: 'Patients',
        action: 'updateMany',
        args: { where: { x: 1 }, data: { stage: 'C' } },
      },
      next,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          new_values: expect.objectContaining({ count: 1 }),
        }),
      }),
    );

    prisma.auditLogs.create.mockClear();
    prisma.patients.findMany.mockRejectedValue(new Error('x'));
    await middleware(
      {
        model: 'Patients',
        action: 'updateMany',
        args: { where: {}, data: {} },
      },
      next,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalled();
  });

  it('swallows audit write failures without failing the mutation', async () => {
    prisma.auditLogs.create.mockRejectedValue(new Error('audit down'));
    const next = jest.fn().mockResolvedValue({ id: UUID });
    const out = await middleware(
      { model: 'Patients', action: 'create', args: {} },
      next,
    );
    expect(out).toEqual({ id: UUID });
  });

  it('uses NIL uuid when result has no id', async () => {
    const next = jest.fn().mockResolvedValue({ name: 'no-id' });
    await middleware({ model: 'Patients', action: 'create', args: {} }, next);
    const entityId = prisma.auditLogs.create.mock.calls[0][0].data.entity_id;
    expect(entityId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('falls through for unknown write actions registered in WRITE_ACTIONS', async () => {
    PRISMA_AUDIT_WRITE_ACTIONS.add('__test_write__');
    try {
      const next = jest.fn().mockResolvedValue('passthrough');
      const out = await middleware(
        { model: 'Patients', action: '__test_write__', args: {} },
        next,
      );
      expect(out).toBe('passthrough');
      expect(prisma.auditLogs.create).not.toHaveBeenCalled();
    } finally {
      PRISMA_AUDIT_WRITE_ACTIONS.delete('__test_write__');
    }
  });

  it('covers entityId NIL fallback, non-Error audit failures, and sparse update args', async () => {
    // delete with no old row and non-object result → entityIdFrom(null) → NIL_UUID
    prisma.patients.findUnique.mockResolvedValue(null);
    const nextDel = jest.fn().mockResolvedValue(null);
    await middleware(
      { model: 'Patients', action: 'delete', args: { where: { id: 'x' } } },
      nextDel,
    );
    expect(prisma.auditLogs.create.mock.calls.at(-1)[0].data.entity_id).toBe(
      '00000000-0000-4000-8000-000000000000',
    );

    // non-Error throw from audit write
    prisma.auditLogs.create.mockRejectedValueOnce('audit-string-fail');
    const next = jest.fn().mockResolvedValue({ id: UUID });
    await middleware({ model: 'Patients', action: 'create', args: {} }, next);

    // update with null result and missing data → spread ?? {}
    prisma.auditLogs.create.mockResolvedValue({});
    prisma.patients.findUnique.mockResolvedValue({ id: UUID, stage: 'A' });
    const nextUp = jest.fn().mockResolvedValue(null);
    await middleware(
      { model: 'Patients', action: 'update', args: { where: { id: UUID } } },
      nextUp,
    );

    // upsert with null result uses oldRow for entity id
    prisma.patients.findUnique.mockResolvedValue({ id: UUID, name: 'old' });
    const nextUpsert = jest.fn().mockResolvedValue(null);
    await middleware(
      { model: 'Patients', action: 'upsert', args: { where: { id: UUID } } },
      nextUpsert,
    );

    // updateMany row path with missing data
    prisma.patients.findMany.mockResolvedValue([{ id: UUID, stage: 'A' }]);
    const nextMany = jest.fn().mockResolvedValue({ count: 1 });
    await middleware(
      {
        model: 'Patients',
        action: 'updateMany',
        args: { where: { id: UUID } },
      },
      nextMany,
    );
    expect(prisma.auditLogs.create).toHaveBeenCalled();
  });
});
