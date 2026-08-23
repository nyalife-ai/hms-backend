/**
 * PrismaPatientRepository — create/update/list/soft-delete with mocks.
 */

import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { Patient } from '../domain/patient.entity';
import { PrismaPatientRepository } from '../repositories/prisma/prisma-patient.repository';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-pw'),
}));

const PID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const UID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function patientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PID,
    user_id: UID,
    patient_number: 'MRN-10001',
    blood_group: 'O+',
    allergies: 'Penicillin',
    chronic_diseases: null,
    occupation: 'Teacher',
    marital_status: 'SINGLE',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-02T00:00:00.000Z'),
    user: {
      email: 'amina@example.com',
      core_profiles_user_id: [
        {
          first_name: 'Amina',
          last_name: 'Wanjiru',
          phone: '0700111222',
          gender: 'FEMALE',
          date_of_birth: new Date('1990-05-12'),
          address: 'Nairobi',
          city: 'Nairobi',
          country: 'KE',
          postal_code: '00100',
        },
      ],
    },
    patients_emergency_contacts_patient_id: [
      { name: 'Kin', phone: '0700999' },
    ],
    ...overrides,
  };
}

describe('PrismaPatientRepository', () => {
  let prisma: any;
  let repo: PrismaPatientRepository;

  beforeEach(() => {
    prisma = {
      patients: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      profiles: { update: jest.fn(), create: jest.fn() },
      user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      emergencyContacts: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (arg: any) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    });
    repo = new PrismaPatientRepository(prisma);
  });

  it('save updates existing patient+profile and errors for new entities', async () => {
    const entity = Patient.reconstitute(
      PID,
      {
        userId: UID,
        patientNumber: 'MRN-10001',
        firstName: 'Amina',
        lastName: 'Wanjiru',
        bloodGroup: 'A+',
        phone: '0700',
      },
      new Date(),
      new Date(),
    );

    prisma.patients.findFirst
      .mockResolvedValueOnce({ id: PID })
      .mockResolvedValueOnce(patientRow());
    prisma.patients.update.mockResolvedValue({});
    prisma.profiles.update.mockResolvedValue({});

    const saved = await repo.save(entity);
    expect(saved.getFirstName()).toBe('Amina');
    expect(prisma.patients.update).toHaveBeenCalled();
    expect(prisma.profiles.update).toHaveBeenCalled();

    prisma.patients.findFirst
      .mockResolvedValueOnce({ id: PID })
      .mockResolvedValueOnce(null);
    await expect(repo.save(entity)).rejects.toThrow(/missing after update/);

    prisma.patients.findFirst.mockResolvedValueOnce(null);
    await expect(repo.save(entity)).rejects.toThrow(/createFromDto/);
  });

  it('createFromDto creates user/profile/patient and optional kin', async () => {
    prisma.patients.count.mockResolvedValue(0);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: UID });
    prisma.profiles.create.mockResolvedValue({});
      prisma.patients.create.mockResolvedValue(patientRow());
    prisma.emergencyContacts.create.mockResolvedValue({});
    prisma.patients.findFirst.mockResolvedValue(patientRow());

    const created = await repo.createFromDto({
      firstName: 'Amina',
      lastName: 'Wanjiru',
      email: 'amina@example.com',
      phone: '0700',
      dateOfBirth: '1990-01-01',
      address: ' Nairobi ',
      city: ' Nairobi ',
      country: ' KE ',
      postalCode: ' 00100 ',
      bloodGroup: 'O+',
      emergencyContactName: 'Kin',
      emergencyContactPhone: '0700999',
    } as any);
    expect(created.getPatientNumber()).toBe('MRN-10001');
    expect(prisma.emergencyContacts.create).toHaveBeenCalled();

    prisma.user.findFirst.mockResolvedValue({ id: 'other' });
    await expect(
      repo.createFromDto({
        firstName: 'A',
        lastName: 'B',
        email: 'taken@example.com',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('createFromDto maps unique constraint conflicts', async () => {
    prisma.patients.count.mockResolvedValue(1);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['patient_number'] },
      }),
    );
    await expect(
      repo.createFromDto({
        firstName: 'A',
        lastName: 'B',
        patientNumber: 'MRN-X',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.$transaction.mockRejectedValue(new Error('db down'));
    await expect(
      repo.createFromDto({ firstName: 'A', lastName: 'B' } as any),
    ).rejects.toThrow('db down');
  });

  it('findById / findAll / exists / findMany / softDelete / applyUpdate / delete', async () => {
    prisma.patients.findFirst.mockResolvedValue(patientRow());
    expect((await repo.findById(PID))?.getId()).toBe(PID);

    prisma.patients.findFirst.mockResolvedValue(null);
    expect(await repo.findById(PID)).toBeNull();

    prisma.patients.findMany.mockResolvedValue([
      patientRow({
        user: { email: null, core_profiles_user_id: [] },
      }),
    ]);
    const all = await repo.findAll();
    expect(all[0].getFirstName()).toBe('');

    prisma.patients.count.mockResolvedValue(1);
    expect(await repo.exists(PID)).toBe(true);

    prisma.patients.count.mockResolvedValue(2);
    prisma.patients.findMany.mockResolvedValue([patientRow()]);
    const page = await repo.findMany({
      page: 1,
      limit: 20,
      search: 'Amina',
      bloodGroup: 'O+',
      maritalStatus: 'SINGLE',
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);

    prisma.patients.update.mockResolvedValue({});
    await repo.softDelete(PID);
    await repo.delete(PID);
    expect(prisma.patients.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      }),
    );

    prisma.patients.findFirst
      .mockResolvedValueOnce(null);
    expect(await repo.applyUpdate(PID, { firstName: 'X' } as any)).toBeNull();

    prisma.patients.findFirst
      .mockResolvedValueOnce(patientRow())
      .mockResolvedValueOnce(patientRow({ blood_group: 'B+' }));
    prisma.patients.update.mockResolvedValue({});
    prisma.profiles.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});
    prisma.emergencyContacts.findFirst.mockResolvedValue({
      id: 'ec1',
      name: 'Kin',
      phone: '0700999',
    });
    prisma.emergencyContacts.update.mockResolvedValue({});
    const updated = await repo.applyUpdate(PID, {
      firstName: 'New',
      bloodGroup: 'B+',
      email: 'new@example.com',
      address: 'Mombasa',
      dateOfBirth: '1991-01-01',
      gender: 'FEMALE',
      emergencyContactName: 'Spouse',
      emergencyContactPhone: '0700111',
    } as any);
    expect(updated?.getBloodGroup()).toBe('B+');
    expect(prisma.profiles.update).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalled();
    expect(prisma.emergencyContacts.update).toHaveBeenCalled();
  });
});
