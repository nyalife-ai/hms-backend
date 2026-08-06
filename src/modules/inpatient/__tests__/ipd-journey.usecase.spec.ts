/**
 * IPD journey unit tests — transaction boundaries & state machine.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IpdJourneyUseCase } from '../use-cases/ipd-journey.usecase';

describe('IpdJourneyUseCase', () => {
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  let prisma: any;
  let journey: IpdJourneyUseCase;

  beforeEach(() => {
    prisma = {
      wards: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      beds: {
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      patients: { findFirst: jest.fn() },
      staffProfiles: { findFirst: jest.fn() },
      admissions: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bedTransfers: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      dischargeSummaries: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    journey = new IpdJourneyUseCase(prisma, events, {
      recordMutation: jest.fn().mockResolvedValue(undefined),
      recordAccess: jest.fn().mockResolvedValue(undefined),
    } as any);
    jest.clearAllMocks();
  });

  it('creates a ward with valid type', async () => {
    prisma.wards.create.mockResolvedValue({ id: 'w1', name: 'A' });
    const ward = await journey.createWard({ name: 'Ward A', wardType: 'ICU' });
    expect(ward.id).toBe('w1');
    expect(prisma.wards.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ward_type: 'ICU' }),
      }),
    );
  });

  it('rejects invalid ward type', async () => {
    await expect(
      journey.createWard({ name: 'X', wardType: 'SPACE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('admits atomically and occupies bed', async () => {
    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.beds.updateMany.mockResolvedValue({ count: 1 });
    prisma.admissions.findFirst.mockResolvedValue(null);
    prisma.admissions.create.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
      bed_id: 'b1',
    });

    const admission = await journey.admit({
      patientId: 'p1',
      bedId: 'b1',
      admittingDoctorId: 'd1',
    });

    expect(admission.id).toBe('a1');
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.beds.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: 'AVAILABLE' },
      data: { status: 'OCCUPIED' },
    });
  });

  it('rejects admit when bed unavailable', async () => {
    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.beds.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      journey.admit({
        patientId: 'p1',
        bedId: 'b1',
        admittingDoctorId: 'd1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transfers with history and frees old bed', async () => {
    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
      bed_id: 'b1',
    });
    prisma.beds.updateMany.mockResolvedValue({ count: 1 });
    prisma.beds.update.mockResolvedValue({});
    prisma.bedTransfers.create.mockResolvedValue({ id: 't1' });
    prisma.admissions.update
      .mockResolvedValueOnce({ id: 'a1', status: 'TRANSFERRED', bed_id: 'b1' })
      .mockResolvedValueOnce({ id: 'a1', bed_id: 'b2', status: 'ADMITTED' });

    const result = await journey.transfer({
      admissionId: 'a1',
      newBedId: 'b2',
      authorizedBy: 'u1',
      reason: 'ICU step-down',
    });

    expect(result.transfer.id).toBe('t1');
    expect(prisma.admissions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'TRANSFERRED' }),
      }),
    );
    expect(prisma.admissions.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bed_id: 'b2',
          status: 'ADMITTED',
        }),
      }),
    );
    expect(prisma.beds.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'AVAILABLE' },
    });
    expect(prisma.bedTransfers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          old_bed_id: 'b1',
          new_bed_id: 'b2',
        }),
      }),
    );
  });

  it('transfer-out sets sticky TRANSFERRED and frees bed', async () => {
    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
      bed_id: 'b1',
      primary_diagnosis: 'Dx',
    });
    prisma.beds.update.mockResolvedValue({});
    prisma.admissions.update.mockResolvedValue({
      id: 'a1',
      status: 'TRANSFERRED',
      bed_id: null,
    });

    const updated = await journey.transferOut({
      admissionId: 'a1',
      authorizedBy: 'u1',
      reason: 'Referral',
      destination: 'Kenyatta',
    });

    expect(updated.status).toBe('TRANSFERRED');
    expect(prisma.beds.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'AVAILABLE' },
    });
  });

  it('discharges and frees bed', async () => {
    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
      bed_id: 'b1',
      patient_id: 'p1',
      primary_diagnosis: 'Dx',
    });
    prisma.beds.update.mockResolvedValue({});
    prisma.admissions.update.mockResolvedValue({
      id: 'a1',
      status: 'DISCHARGED',
    });
    prisma.dischargeSummaries.findUnique.mockResolvedValue(null);
    prisma.dischargeSummaries.create.mockResolvedValue({});

    const discharged = await journey.discharge({
      admissionId: 'a1',
      dischargingDoctorId: 'd1',
      finalizedBy: 'u1',
    });

    expect(discharged.status).toBe('DISCHARGED');
    expect(prisma.beds.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'AVAILABLE' },
    });
  });

  it('rejects transfer for missing admission', async () => {
    prisma.admissions.findFirst.mockResolvedValue(null);
    await expect(
      journey.transfer({
        admissionId: 'missing',
        newBedId: 'b2',
        authorizedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
