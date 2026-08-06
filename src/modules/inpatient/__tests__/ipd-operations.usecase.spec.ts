/**
 * IPD operations unit tests — reservations, bed transitions, nursing, discharge draft.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IpdOperationsUseCase } from '../use-cases/ipd-operations.usecase';

describe('IpdOperationsUseCase', () => {
  let prisma: any;
  let ops: IpdOperationsUseCase;

  beforeEach(() => {
    prisma = {
      wards: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      beds: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      patients: { findFirst: jest.fn() },
      staffProfiles: { findFirst: jest.fn() },
      admissions: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      bedReservations: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      bedTransfers: { findMany: jest.fn() },
      nursingNotes: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      dischargeSummaries: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    ops = new IpdOperationsUseCase(prisma, {
      recordMutation: jest.fn().mockResolvedValue(undefined),
      recordAccess: jest.fn().mockResolvedValue(undefined),
    } as any);
    jest.clearAllMocks();
  });

  it('rejects manual OCCUPIED → AVAILABLE transition', async () => {
    prisma.beds.findFirst.mockResolvedValue({
      id: 'b1',
      status: 'OCCUPIED',
    });
    await expect(
      ops.updateBedStatus('b1', 'AVAILABLE'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows AVAILABLE → MAINTENANCE', async () => {
    prisma.beds.findFirst.mockResolvedValue({
      id: 'b1',
      status: 'AVAILABLE',
    });
    prisma.beds.update.mockResolvedValue({ id: 'b1', status: 'MAINTENANCE' });
    const bed = await ops.updateBedStatus('b1', 'MAINTENANCE');
    expect(bed.status).toBe('MAINTENANCE');
  });

  it('reserves a bed transactionally', async () => {
    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.bedReservations.findFirst.mockResolvedValue(null);
    prisma.beds.updateMany.mockResolvedValue({ count: 1 });
    prisma.bedReservations.create.mockResolvedValue({
      id: 'r1',
      status: 'RESERVED',
    });

    const row = await ops.reserveBed({
      bedId: 'b1',
      patientId: 'p1',
      expectedAdmissionDate: '2026-08-10',
      expiresAt: '2026-08-12T00:00:00.000Z',
      reservedBy: 'u1',
    });

    expect(row.id).toBe('r1');
    expect(prisma.beds.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: 'AVAILABLE' },
      data: { status: 'RESERVED' },
    });
  });

  it('rejects reserve when bed unavailable', async () => {
    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.bedReservations.findFirst.mockResolvedValue(null);
    prisma.beds.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      ops.reserveBed({
        bedId: 'b1',
        patientId: 'p1',
        expectedAdmissionDate: '2026-08-10',
        expiresAt: '2026-08-12T00:00:00.000Z',
        reservedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('converts reservation to admission', async () => {
    prisma.bedReservations.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'RESERVED',
      bed_id: 'b1',
      patient_id: 'p1',
      expires_at: new Date(Date.now() + 86400000),
    });
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.admissions.findFirst.mockResolvedValue(null);
    prisma.beds.updateMany.mockResolvedValue({ count: 1 });
    prisma.admissions.create.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
    });
    prisma.bedReservations.update.mockResolvedValue({});

    const result = await ops.convertReservation({
      reservationId: 'r1',
      admittingDoctorId: 'd1',
      actorUserId: 'u1',
    });

    expect(result.admission.id).toBe('a1');
    expect(prisma.bedReservations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CONVERTED',
          admission_id: 'a1',
        }),
      }),
    );
  });

  it('creates append-only nursing note', async () => {
    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
    });
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'n1' });
    prisma.nursingNotes.create.mockResolvedValue({ id: 'note1' });

    const note = await ops.addNursingNote({
      admissionId: 'a1',
      nurseId: 'n1',
      notesText: 'Vitals stable',
      vitalSignsSnapshot: { hr: 72 },
    });

    expect(note.id).toBe('note1');
    expect(prisma.nursingNotes.create).toHaveBeenCalled();
  });

  it('blocks finalize without diagnosis/summary', async () => {
    prisma.dischargeSummaries.findUnique.mockResolvedValue({
      id: 'ds1',
      discharge_diagnosis: null,
      summary_of_treatment: null,
      finalized_at: null,
    });
    await expect(
      ops.finalizeDischargeSummary('a1', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('finalizes discharge summary draft', async () => {
    prisma.dischargeSummaries.findUnique.mockResolvedValue({
      id: 'ds1',
      discharge_diagnosis: 'Resolved',
      summary_of_treatment: 'Treated',
      finalized_at: null,
    });
    prisma.dischargeSummaries.update.mockResolvedValue({
      id: 'ds1',
      finalized_at: new Date(),
    });
    const row = await ops.finalizeDischargeSummary('a1', 'u1');
    expect(row.finalized_at).toBeTruthy();
  });

  it('marks deceased and frees bed', async () => {
    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
      bed_id: 'b1',
      primary_diagnosis: 'Dx',
    });
    prisma.beds.update.mockResolvedValue({});
    prisma.admissions.update.mockResolvedValue({
      id: 'a1',
      status: 'DECEASED',
    });

    const updated = await ops.markDeceased({
      admissionId: 'a1',
      actorUserId: 'u1',
    });
    expect(updated.status).toBe('DECEASED');
    expect(prisma.beds.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'AVAILABLE' },
    });
  });

  it('bulk-creates beds via createMany after duplicate check', async () => {
    prisma.wards.findFirst.mockResolvedValue({ id: 'w1', is_active: true });
    prisma.beds.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'b1', bed_number: 'A1' },
        { id: 'b2', bed_number: 'A2' },
      ]);
    prisma.beds.createMany = jest.fn().mockResolvedValue({ count: 2 });

    const created = await ops.createBedsBulk({
      wardId: 'w1',
      bedNumbers: ['A1', 'A2', 'A1'],
    });

    expect(prisma.beds.createMany).toHaveBeenCalledWith({
      data: [
        { ward_id: 'w1', bed_number: 'A1', status: 'AVAILABLE' },
        { ward_id: 'w1', bed_number: 'A2', status: 'AVAILABLE' },
      ],
    });
    expect(created).toHaveLength(2);
  });

  it('rejects bulk create when duplicates exist', async () => {
    prisma.wards.findFirst.mockResolvedValue({ id: 'w1', is_active: true });
    prisma.beds.findMany.mockResolvedValue([{ bed_number: 'A1' }]);
    await expect(
      ops.createBedsBulk({ wardId: 'w1', bedNumbers: ['A1'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects deactivate ward with occupied beds', async () => {
    prisma.beds.count.mockResolvedValue(2);
    await expect(ops.deactivateWard('w1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when nursing note missing', async () => {
    prisma.nursingNotes.findFirst.mockResolvedValue(null);
    await expect(ops.getNursingNote('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
