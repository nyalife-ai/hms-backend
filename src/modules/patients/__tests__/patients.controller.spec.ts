/**
 * PatientsController — ownership checks + service/audit delegation.
 */

import { ForbiddenException } from '@nestjs/common';
import { PatientsController } from '../patients.controller';

describe('PatientsController', () => {
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'p1' }),
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findById: jest.fn().mockResolvedValue({ id: 'p1' }),
    update: jest.fn().mockResolvedValue({ id: 'p1', name: 'Updated' }),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    patients: { findFirst: jest.fn() },
  };
  const audit = {
    recordAccess: jest.fn().mockResolvedValue(undefined),
    recordMutation: jest.fn().mockResolvedValue(undefined),
  };

  const controller = new PatientsController(
    service as never,
    prisma as never,
    audit as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delegates create and findAll', async () => {
    await expect(
      controller.create({ firstName: 'A' } as never),
    ).resolves.toEqual({ id: 'p1' });
    await expect(controller.findAll({ page: 1 } as never)).resolves.toEqual({
      items: [],
      total: 0,
    });
  });

  it('findOne records access for staff without ownership check', async () => {
    const user = { id: 'u1', role: 'DOCTOR' } as never;
    await expect(
      controller.findOne('p1', { user }),
    ).resolves.toEqual({ id: 'p1' });
    expect(prisma.patients.findFirst).not.toHaveBeenCalled();
    expect(audit.recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        patientId: 'p1',
        entityType: 'patients.patients',
      }),
    );
  });

  it('enforces patient ownership on findOne and update', async () => {
    const patientUser = { id: 'u-pat', role: 'PATIENT' } as never;
    prisma.patients.findFirst.mockResolvedValueOnce({ id: 'p1' });
    await controller.findOne('p1', { user: patientUser });
    expect(prisma.patients.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1', user_id: 'u-pat', deleted_at: null },
      }),
    );

    prisma.patients.findFirst.mockResolvedValueOnce(null);
    await expect(
      controller.findOne('p2', { user: patientUser }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    prisma.patients.findFirst.mockResolvedValueOnce({ id: 'p1' });
    await controller.update('p1', { firstName: 'B' } as never, {
      user: patientUser,
    });
    expect(audit.recordMutation).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityId: 'p1' }),
    );
  });

  it('remove soft-deletes and audits DELETE', async () => {
    const admin = { id: 'admin', role: 'ADMIN' } as never;
    await controller.remove('p1', { user: admin });
    expect(service.softDelete).toHaveBeenCalledWith('p1');
    expect(audit.recordMutation).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entityId: 'p1' }),
    );
  });
});
