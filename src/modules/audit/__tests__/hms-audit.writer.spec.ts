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
