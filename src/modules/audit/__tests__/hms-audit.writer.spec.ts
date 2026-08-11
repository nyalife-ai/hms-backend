/**
 * Unit tests for HmsAuditWriter (mutation + access appends).
 */

import { HmsAuditWriter } from '../hms-audit.writer';

describe('HmsAuditWriter', () => {
  it('writes mutation audit when prisma connected', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'a1' });
    const prisma = {
      isConnected: true,
      auditLogs: { create },
      accessLogs: { create: jest.fn() },
    } as any;
    const writer = new HmsAuditWriter(prisma);
    await writer.recordMutation({
      userId: 'u1',
      action: 'CREATE',
      entityType: 'patients.patients',
      entityId: '00000000-0000-0000-0000-000000000001',
      newValues: { mrn: 'MRN-1' },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          entity_type: 'patients.patients',
          user_id: 'u1',
        }),
      }),
    );
  });

  it('masks sensitive fields and stores field-level from→to changes', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'a2' });
    const prisma = {
      isConnected: true,
      auditLogs: { create },
      accessLogs: { create: jest.fn() },
    } as any;
    const writer = new HmsAuditWriter(prisma);
    await writer.recordMutation({
      userId: 'u1',
      action: 'UPDATE',
      entityType: 'User',
      entityId: '00000000-0000-0000-0000-0000000000aa',
      oldValues: {
        email: 'old@nyalife.health',
        phone: '+254700111222',
        role: 'NURSE',
      },
      newValues: {
        email: 'new@nyalife.health',
        phone: '+254700111222',
        role: 'DOCTOR',
        otp: '999999',
      },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.old_values.email).toBe('o***@nyalife.health');
    expect(data.old_values.phone).toBe('***22');
    expect(data.new_values.email).toBe('n***@nyalife.health');
    expect(data.new_values.otp).toBe('***');
    expect(data.new_values.__changedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'role',
          from: 'NURSE',
          to: 'DOCTOR',
        }),
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'otp', to: '***' }),
      ]),
    );
  });

  it('writes access log for sensitive reads', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'x1' });
    const prisma = {
      isConnected: true,
      auditLogs: { create: jest.fn() },
      accessLogs: { create },
    } as any;
    const writer = new HmsAuditWriter(prisma);
    await writer.recordAccess({
      userId: 'u1',
      patientId: '00000000-0000-0000-0000-000000000002',
      entityType: 'billing.invoices',
      entityId: '00000000-0000-0000-0000-000000000002',
    });
    expect(create).toHaveBeenCalled();
  });

  it('no-ops when database disconnected', async () => {
    const create = jest.fn();
    const prisma = {
      isConnected: false,
      auditLogs: { create },
      accessLogs: { create },
    } as any;
    const writer = new HmsAuditWriter(prisma);
    await writer.recordMutation({
      action: 'UPDATE',
      entityType: 'auth.session',
      entityId: '00000000-0000-0000-0000-000000000003',
    });
    expect(create).not.toHaveBeenCalled();
  });
});
