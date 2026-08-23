/**
 * IPD operations unit tests — reservations, bed transitions, nursing, discharge draft.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IpdOperationsUseCase } from '../use-cases/ipd-operations.usecase';

const profile = (first = 'Jane', last = 'Doe') => [
  { first_name: first, last_name: last },
];

describe('IpdOperationsUseCase', () => {
  let prisma: any;
  let audit: { recordMutation: jest.Mock; recordAccess: jest.Mock };
  let events: { emit: jest.Mock };
  let pharmacy: {
    listPrescriptions: jest.Mock;
    createPrescription: jest.Mock;
  };
  let ops: IpdOperationsUseCase;

  beforeEach(() => {
    prisma = {
      wards: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      beds: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      patients: { findFirst: jest.fn() },
      staffProfiles: { findFirst: jest.fn() },
      admissions: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      bedReservations: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      bedTransfers: { findMany: jest.fn().mockResolvedValue([]) },
      nursingNotes: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
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
    audit = {
      recordMutation: jest.fn().mockResolvedValue(undefined),
      recordAccess: jest.fn().mockResolvedValue(undefined),
    };
    events = { emit: jest.fn() };
    pharmacy = {
      listPrescriptions: jest.fn().mockResolvedValue({ items: [] }),
      createPrescription: jest.fn(),
    };
    ops = new IpdOperationsUseCase(
      prisma,
      audit as any,
      pharmacy as any,
      events as any,
    );
    jest.clearAllMocks();
  });

  it('overview aggregates wards, beds, and recent activity', async () => {
    prisma.wards.count.mockResolvedValue(2);
    prisma.beds.groupBy.mockResolvedValue([
      { status: 'AVAILABLE', _count: { _all: 3 } },
      { status: 'OCCUPIED', _count: { _all: 2 } },
    ]);
    prisma.admissions.count.mockResolvedValue(4);
    prisma.bedReservations.count.mockResolvedValue(1);
    prisma.bedTransfers.findMany.mockResolvedValue([
      {
        id: 't1',
        admission_id: 'a1',
        reason: 'ICU',
        transfer_date: new Date('2026-08-01'),
        admission: {
          patient: {
            patient_number: 'MRN1',
            user: { core_profiles_user_id: profile() },
          },
        },
        new_bed: { bed_number: 'B2', ward: { name: 'ICU' } },
      },
    ]);
    prisma.admissions.findMany.mockResolvedValue([
      {
        id: 'a2',
        primary_diagnosis: 'Dx',
        discharge_date: new Date('2026-08-02'),
        patient: {
          patient_number: 'MRN2',
          user: { core_profiles_user_id: profile('John', 'Smith') },
        },
      },
    ]);
    const board = await ops.overview();
    expect(board.wards).toBe(2);
    expect(board.totalBeds).toBe(5);
    expect(board.availableBeds).toBe(3);
    expect(board.recentTransfers[0].newWard).toBe('ICU');
    expect(board.recentDischarges[0].mrn).toBe('MRN2');
  });

  it('lists and gets wards with validation', async () => {
    await expect(
      ops.listWards({ wardType: 'INVALID' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.wards.findMany.mockResolvedValue([
      {
        id: 'w1',
        name: 'General',
        ward_type: 'GENERAL',
        department_id: null,
        daily_rate: 1000,
        capacity: 10,
        is_active: true,
        inpatient_beds_ward_id: [
          { id: 'b1', status: 'AVAILABLE' },
          { id: 'b2', status: 'OCCUPIED' },
        ],
      },
    ]);
    prisma.wards.count.mockResolvedValue(1);
    const listed = await ops.listWards({
      wardType: 'general',
      search: 'Gen',
      page: 1,
      limit: 20,
    });
    expect(listed.items[0].availableBeds).toBe(1);

    prisma.wards.findFirst.mockResolvedValue(null);
    await expect(ops.getWard('x')).rejects.toBeInstanceOf(NotFoundException);

    prisma.wards.findFirst.mockResolvedValue({
      id: 'w1',
      name: 'General',
      ward_type: 'GENERAL',
      department_id: null,
      daily_rate: 1000,
      capacity: 10,
      is_active: true,
      inpatient_beds_ward_id: [{ id: 'b1', bed_number: 'A1', status: 'AVAILABLE' }],
    });
    const ward = await ops.getWard('w1');
    expect(ward.totals.available).toBe(1);
  });

  it('updates and deactivates wards', async () => {
    prisma.wards.findFirst.mockResolvedValue(null);
    await expect(ops.updateWard('x', { name: 'N' })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.wards.findFirst.mockResolvedValue({ id: 'w1' });
    await expect(
      ops.updateWard('w1', { wardType: 'BAD' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.wards.update.mockResolvedValue({ id: 'w1', name: 'New' });
    const updated = await ops.updateWard('w1', {
      name: ' New ',
      wardType: 'icu',
      departmentId: 'd1',
      dailyRate: 2000,
      capacity: 5,
      isActive: true,
    });
    expect(updated.name).toBe('New');

    prisma.beds.count.mockResolvedValue(0);
    prisma.wards.findFirst.mockResolvedValue({ id: 'w1' });
    prisma.wards.update.mockResolvedValue({ id: 'w1', is_active: false });
    await ops.deactivateWard('w1');
    expect(prisma.wards.update).toHaveBeenCalled();
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

  it('lists beds and guards bed status updates', async () => {
    await expect(ops.listBeds({ status: 'BROKEN' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.beds.findMany.mockResolvedValue([
      {
        id: 'b1',
        ward_id: 'w1',
        bed_number: 'A1',
        status: 'AVAILABLE',
        ward: { name: 'General' },
      },
    ]);
    prisma.beds.count.mockResolvedValue(1);
    const listed = await ops.listBeds({
      wardId: 'w1',
      status: 'available',
      search: 'A',
    });
    expect(listed.items[0].wardName).toBe('General');

    await expect(ops.updateBedStatus('b1', 'WEIRD')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.beds.findFirst.mockResolvedValue(null);
    await expect(ops.updateBedStatus('x', 'AVAILABLE')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.beds.findFirst.mockResolvedValue({ id: 'b1', status: 'AVAILABLE' });
    expect(await ops.updateBedStatus('b1', 'AVAILABLE')).toEqual({
      id: 'b1',
      status: 'AVAILABLE',
    });

    prisma.beds.findFirst.mockResolvedValue({ id: 'b1', status: 'MAINTENANCE' });
    prisma.admissions.findFirst.mockResolvedValue({ id: 'a1' });
    await expect(
      ops.updateBedStatus('b1', 'AVAILABLE'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.admissions.findFirst.mockResolvedValue(null);
    prisma.beds.update.mockResolvedValue({ id: 'b1', status: 'AVAILABLE' });
    await ops.updateBedStatus('b1', 'AVAILABLE', 'u1');
    expect(audit.recordMutation).toHaveBeenCalled();
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

  it('rejects reserve when bed unavailable or patient missing', async () => {
    prisma.patients.findFirst.mockResolvedValue(null);
    await expect(
      ops.reserveBed({
        bedId: 'b1',
        patientId: 'p1',
        expectedAdmissionDate: '2026-08-10',
        expiresAt: '2026-08-12T00:00:00.000Z',
        reservedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.bedReservations.findFirst.mockResolvedValue({ id: 'r0' });
    await expect(
      ops.reserveBed({
        bedId: 'b1',
        patientId: 'p1',
        expectedAdmissionDate: '2026-08-10',
        expiresAt: '2026-08-12T00:00:00.000Z',
        reservedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

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
      patient_id: 'p1',
    });
    prisma.bedReservations.update.mockResolvedValue({});

    const result = await ops.convertReservation({
      reservationId: 'r1',
      admittingDoctorId: 'd1',
      actorUserId: 'u1',
    });

    expect(result.admission.id).toBe('a1');
    expect(events.emit).toHaveBeenCalled();
    expect(prisma.bedReservations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CONVERTED',
          admission_id: 'a1',
        }),
      }),
    );

    events.emit.mockImplementation(() => {
      throw new Error('notify fail');
    });
    prisma.bedReservations.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'RESERVED',
      bed_id: 'b1',
      patient_id: 'p1',
      expires_at: new Date(Date.now() + 86400000),
    });
    prisma.admissions.create.mockResolvedValue({
      id: 'a2',
      status: 'ADMITTED',
      patient_id: 'p1',
    });
    await expect(
      ops.convertReservation({
        reservationId: 'r1',
        admittingDoctorId: 'd1',
        actorUserId: 'u1',
      }),
    ).resolves.toBeTruthy();
  });

  it('convertReservation error branches', async () => {
    prisma.bedReservations.findFirst.mockResolvedValue(null);
    await expect(
      ops.convertReservation({
        reservationId: 'r1',
        admittingDoctorId: 'd1',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.bedReservations.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'RESERVED',
      bed_id: 'b1',
      patient_id: 'p1',
      expires_at: new Date(Date.now() - 1000),
    });
    await expect(
      ops.convertReservation({
        reservationId: 'r1',
        admittingDoctorId: 'd1',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.bedReservations.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'RESERVED',
      bed_id: 'b1',
      patient_id: 'p1',
      expires_at: new Date(Date.now() + 86400000),
    });
    prisma.staffProfiles.findFirst.mockResolvedValue(null);
    await expect(
      ops.convertReservation({
        reservationId: 'r1',
        admittingDoctorId: 'd1',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.admissions.findFirst.mockResolvedValue({ id: 'a0' });
    await expect(
      ops.convertReservation({
        reservationId: 'r1',
        admittingDoctorId: 'd1',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.admissions.findFirst.mockResolvedValue(null);
    prisma.beds.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      ops.convertReservation({
        reservationId: 'r1',
        admittingDoctorId: 'd1',
        actorUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists reservations and cancels/expires them', async () => {
    prisma.bedReservations.findMany
      .mockResolvedValueOnce([]) // expireDueReservations
      .mockResolvedValueOnce([
        {
          id: 'r1',
          status: 'RESERVED',
          bed_id: 'b1',
          patient_id: 'p1',
          expected_admission_date: new Date('2026-08-10'),
          expires_at: new Date('2026-08-12'),
          reserved_by: 'u1',
          admission_id: null,
          bed: { bed_number: 'A1', ward_id: 'w1', ward: { name: 'G' } },
          patient: {
            patient_number: 'MRN1',
            user: { core_profiles_user_id: profile() },
          },
        },
      ]);
    prisma.bedReservations.count.mockResolvedValue(1);
    const listed = await ops.listReservations({
      status: 'reserved',
      bedId: 'b1',
      search: 'Jane',
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
    });
    expect(listed.items[0].bedNumber).toBe('A1');

    prisma.bedReservations.findFirst.mockResolvedValue({
      id: 'r1',
      bed_id: 'b1',
      status: 'RESERVED',
    });
    prisma.bedReservations.update.mockResolvedValue({});
    prisma.beds.updateMany.mockResolvedValue({ count: 1 });
    expect(
      (await ops.cancelReservation('r1', 'u1')).status,
    ).toBe('CANCELLED');

    prisma.bedReservations.findFirst.mockResolvedValue(null);
    await expect(ops.cancelReservation('x', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.bedReservations.findFirst.mockResolvedValue({
      id: 'r1',
      bed_id: 'b1',
      status: 'RESERVED',
    });
    expect((await ops.expireReservation('r1')).status).toBe('EXPIRED');

    prisma.bedReservations.findMany.mockResolvedValue([
      { id: 'r2', bed_id: 'b2' },
    ]);
    expect(await ops.expireDueReservations()).toBe(1);
  });

  it('creates append-only nursing note', async () => {
    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
    });
    prisma.staffProfiles.findFirst.mockResolvedValue({
      id: 'n1',
      employee_id: 'EMP1',
    });
    prisma.nursingNotes.create.mockResolvedValue({
      id: 'note1',
      admission_id: 'a1',
      notes_text: 'Vitals stable',
      vital_signs_snapshot: { noteType: 'NURSING', hr: 72 },
      nurse_id: 'n1',
      created_at: new Date('2026-01-15T10:00:00.000Z'),
    });

    const note = await ops.addNursingNote({
      admissionId: 'a1',
      nurseId: 'n1',
      notesText: 'Vitals stable',
      vitalSignsSnapshot: { hr: 72 },
    });

    expect(note.id).toBe('note1');
    expect(prisma.nursingNotes.create).toHaveBeenCalled();
  });

  it('nursing note validation and lookup by user_id', async () => {
    prisma.admissions.findFirst.mockResolvedValue(null);
    await expect(
      ops.addNursingNote({
        admissionId: 'a1',
        nurseId: 'n1',
        notesText: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.admissions.findFirst.mockResolvedValue({ id: 'a1', status: 'ADMITTED' });
    prisma.staffProfiles.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await expect(
      ops.addNursingNote({
        admissionId: 'a1',
        nurseId: 'n1',
        notesText: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.staffProfiles.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'n1', employee_id: 'EMP1' });
    await expect(
      ops.addNursingNote({
        admissionId: 'a1',
        nurseId: 'user-1',
        notesText: '  ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.staffProfiles.findFirst.mockResolvedValue({
      id: 'n1',
      employee_id: 'EMP1',
    });
    await expect(
      ops.addNursingNote({
        admissionId: 'a1',
        nurseId: 'n1',
        notesText: 'ok',
        vitalSignsSnapshot: [] as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.addNursingNote({
        admissionId: 'a1',
        nurseId: 'n1',
        notesText: 'ok',
        noteType: 'INVALID',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists nursing notes, vitals, and records vitals', async () => {
    prisma.nursingNotes.findMany.mockResolvedValue([
      {
        id: 'n1',
        admission_id: 'a1',
        notes_text: 'vitals',
        vital_signs_snapshot: {
          noteType: 'VITALS',
          temperature: '37',
          pulse: '80',
        },
        nurse_id: 's1',
        created_at: new Date('2026-08-01'),
        nurse: {
          employee_id: 'EMP1',
          user: { core_profiles_user_id: profile('Nurse', 'A') },
        },
      },
      {
        id: 'n2',
        admission_id: 'a1',
        notes_text: 'progress',
        vital_signs_snapshot: { noteType: 'PROGRESS' },
        nurse_id: 's1',
        created_at: new Date('2026-08-01'),
        nurse: {
          employee_id: 'EMP1',
          user: { core_profiles_user_id: [] },
        },
      },
    ]);
    const notes = await ops.listNursingNotes('a1');
    expect(notes[0].noteType).toBe('VITALS');

    const vitals = await ops.listAdmissionVitals('a1');
    expect(vitals).toHaveLength(1);

    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
    });
    prisma.staffProfiles.findFirst.mockResolvedValue({
      id: 'n1',
      employee_id: 'EMP1',
    });
    prisma.nursingNotes.create.mockResolvedValue({
      id: 'note2',
      admission_id: 'a1',
      notes_text: 'Vitals recorded',
      vital_signs_snapshot: { noteType: 'VITALS', bp: '120/80' },
      nurse_id: 'n1',
      created_at: new Date(),
    });
    const recorded = await ops.recordAdmissionVitals({
      admissionId: 'a1',
      nurseId: 'n1',
      vitals: { systolic: '120', diastolic: '80', temperature: '37' },
    });
    expect(recorded.noteType).toBe('VITALS');

    prisma.nursingNotes.findFirst.mockResolvedValue({
      id: 'n1',
      admission_id: 'a1',
      notes_text: 'x',
      vital_signs_snapshot: {},
      nurse_id: 's1',
      created_at: new Date(),
      nurse: {
        employee_id: 'EMP1',
        user: { core_profiles_user_id: profile() },
      },
    });
    expect((await ops.getNursingNote('n1')).id).toBe('n1');
  });

  it('ward medications list and order', async () => {
    prisma.admissions.findFirst.mockResolvedValue(null);
    await expect(ops.listWardMedications('a1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      patient_id: 'p1',
      admission_date: new Date('2026-08-01'),
      discharge_date: null,
      status: 'ADMITTED',
    });
    pharmacy.listPrescriptions.mockResolvedValue({
      items: [
        {
          id: 'rx1',
          notes: 'admission a1 linked',
          prescriptionDate: '2026-08-02T00:00:00.000Z',
        },
        {
          id: 'rx2',
          notes: '',
          prescriptionDate: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    const meds = await ops.listWardMedications('a1');
    expect(meds).toHaveLength(1);

    const opsNoPharmacy = new IpdOperationsUseCase(prisma, audit as any);
    expect(await opsNoPharmacy.listWardMedications('a1')).toEqual([]);

    await expect(
      opsNoPharmacy.orderWardMedication({
        admissionId: 'a1',
        prescribedByStaffId: 'd1',
        lines: [
          {
            medicationId: 'm1',
            dosage: '1',
            frequency: 'OD',
            duration: '3d',
            quantity: 3,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    pharmacy.createPrescription.mockResolvedValue({ id: 'rx9' });
    prisma.staffProfiles.findFirst.mockResolvedValue({
      id: 'd1',
      employee_id: 'DOC1',
    });
    prisma.nursingNotes.create.mockResolvedValue({
      id: 'note3',
      admission_id: 'a1',
      notes_text: 'Ward medication ordered',
      vital_signs_snapshot: { noteType: 'MEDICATION', prescriptionId: 'rx9' },
      nurse_id: 'd1',
      created_at: new Date(),
    });
    const rx = await ops.orderWardMedication({
      admissionId: 'a1',
      prescribedByStaffId: 'd1',
      lines: [
        {
          medicationId: 'm1',
          dosage: '1 tab',
          frequency: 'BD',
          duration: '5d',
          quantity: 10,
        },
      ],
      actorUserId: 'u1',
    });
    expect(rx.id).toBe('rx9');
  });

  it('gets and lists admissions', async () => {
    prisma.admissions.findFirst.mockResolvedValue(null);
    await expect(ops.getAdmission('x')).rejects.toBeInstanceOf(NotFoundException);

    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
      patient_id: 'p1',
      bed_id: 'b1',
      admitting_doctor_id: 'd1',
      primary_diagnosis: 'Dx',
      admission_date: new Date('2026-08-01'),
      discharge_date: null,
      patient: {
        patient_number: 'MRN1',
        user: { core_profiles_user_id: profile() },
      },
      bed: { bed_number: 'A1', ward_id: 'w1', ward: { name: 'General' } },
      admitting_doctor: {
        user: { core_profiles_user_id: profile('Doc', 'Tor') },
      },
      inpatient_bed_transfers_admission_id: [
        {
          id: 't1',
          old_bed_id: 'b0',
          new_bed_id: 'b1',
          reason: 'move',
          transfer_date: new Date('2026-08-02'),
          authorized_by: 'u1',
        },
      ],
      inpatient_nursing_notes_admission_id: [
        {
          id: 'n1',
          notes_text: 'ok',
          vital_signs_snapshot: {},
          nurse_id: 's1',
          created_at: new Date('2026-08-01'),
          nurse: {
            employee_id: 'EMP1',
            user: { core_profiles_user_id: profile('N', 'urse') },
          },
        },
      ],
      inpatient_discharge_summaries_admission_id: [
        {
          id: 'ds1',
          discharge_diagnosis: 'Resolved',
          summary_of_treatment: 'Tx',
          discharge_medications: 'Rx',
          follow_up_instructions: 'FU',
          discharging_doctor_id: 'd1',
          finalized_at: null,
          finalized_by: null,
        },
      ],
    });
    const detail = await ops.getAdmission('a1');
    expect(detail.wardName).toBe('General');
    expect(detail.dischargeSummary?.id).toBe('ds1');

    prisma.admissions.findMany.mockResolvedValue([
      {
        id: 'a1',
        status: 'ADMITTED',
        patient_id: 'p1',
        bed_id: 'b1',
        admitting_doctor_id: 'd1',
        primary_diagnosis: 'Dx',
        admission_date: new Date('2026-08-01'),
        discharge_date: null,
        patient: {
          patient_number: 'MRN1',
          user: { core_profiles_user_id: profile() },
        },
        bed: { bed_number: 'A1', ward_id: 'w1', ward: { name: 'General' } },
        admitting_doctor: {
          user: { core_profiles_user_id: profile('Doc', 'Tor') },
        },
      },
    ]);
    prisma.admissions.count.mockResolvedValue(1);
    const listed = await ops.listAdmissions({
      activeOnly: true,
      search: 'Jane',
    });
    expect(listed.items[0].mrn).toBe('MRN1');
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

  it('upserts and gets discharge summary', async () => {
    prisma.admissions.findFirst.mockResolvedValue(null);
    await expect(
      ops.upsertDischargeSummary({
        admissionId: 'a1',
        dischargingDoctorId: 'd1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'DISCHARGED',
    });
    await expect(
      ops.upsertDischargeSummary({
        admissionId: 'a1',
        dischargingDoctorId: 'd1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.admissions.findFirst.mockResolvedValue({
      id: 'a1',
      status: 'ADMITTED',
    });
    prisma.dischargeSummaries.findUnique.mockResolvedValue({
      id: 'ds1',
      finalized_at: new Date(),
    });
    await expect(
      ops.upsertDischargeSummary({
        admissionId: 'a1',
        dischargingDoctorId: 'd1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.dischargeSummaries.findUnique.mockResolvedValue(null);
    prisma.staffProfiles.findFirst.mockResolvedValue(null);
    await expect(
      ops.upsertDischargeSummary({
        admissionId: 'a1',
        dischargingDoctorId: 'd1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.dischargeSummaries.create.mockResolvedValue({ id: 'ds1' });
    expect(
      (
        await ops.upsertDischargeSummary({
          admissionId: 'a1',
          dischargingDoctorId: 'd1',
          dischargeDiagnosis: 'Dx',
          actorUserId: 'u1',
        })
      ).id,
    ).toBe('ds1');

    prisma.dischargeSummaries.findUnique.mockResolvedValue({
      id: 'ds1',
      finalized_at: null,
    });
    prisma.dischargeSummaries.update.mockResolvedValue({ id: 'ds1', updated: true });
    await ops.upsertDischargeSummary({
      admissionId: 'a1',
      dischargingDoctorId: 'd1',
      summaryOfTreatment: 'Tx',
    });

    prisma.dischargeSummaries.findUnique.mockResolvedValue({
      id: 'ds1',
      admission_id: 'a1',
      discharge_diagnosis: 'Dx',
      summary_of_treatment: 'Tx',
      discharge_medications: null,
      follow_up_instructions: null,
      discharging_doctor_id: 'd1',
      finalized_at: null,
      finalized_by: null,
    });
    expect((await ops.getDischargeSummary('a1')).id).toBe('ds1');

    prisma.dischargeSummaries.findUnique.mockResolvedValue(null);
    await expect(ops.getDischargeSummary('a1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      ops.finalizeDischargeSummary('a1', 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.dischargeSummaries.findUnique.mockResolvedValue({
      id: 'ds1',
      discharge_diagnosis: 'Dx',
      summary_of_treatment: 'Tx',
      finalized_at: new Date(),
    });
    await expect(
      ops.finalizeDischargeSummary('a1', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
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
      notes: 'cardiac',
    });
    expect(updated.status).toBe('DECEASED');
    expect(prisma.beds.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'AVAILABLE' },
    });

    prisma.admissions.findFirst.mockResolvedValue(null);
    await expect(
      ops.markDeceased({ admissionId: 'x', actorUserId: 'u1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
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

  it('rejects bulk create when duplicates exist or empty', async () => {
    prisma.wards.findFirst.mockResolvedValue(null);
    await expect(
      ops.createBedsBulk({ wardId: 'w1', bedNumbers: ['A1'] }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.wards.findFirst.mockResolvedValue({ id: 'w1', is_active: true });
    await expect(
      ops.createBedsBulk({ wardId: 'w1', bedNumbers: ['  '] }),
    ).rejects.toBeInstanceOf(BadRequestException);

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
