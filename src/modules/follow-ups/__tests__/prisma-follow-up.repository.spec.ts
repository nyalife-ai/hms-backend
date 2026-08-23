/**
 * PrismaFollowUpRepository — list/summary/save/scope with Prisma mocks.
 */

import { FollowUp } from '../domain/follow-up.entity';
import { FollowUpStatus } from '../enums/follow-up-status.enum';
import { PrismaFollowUpRepository } from '../repositories/prisma/prisma-follow-up.repository';

const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const PAT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function followUpRow(overrides: Record<string, unknown> = {}) {
  return {
    id: UUID,
    patient_id: PAT,
    consultation_id: CONS,
    follow_up_date: new Date('2026-08-20T00:00:00.000Z'),
    follow_up_type: 'Review',
    reason: 'ANC review',
    status: FollowUpStatus.SCHEDULED,
    notes: 'Bring booklet',
    created_by: USER,
    created_at: new Date('2026-08-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-02T00:00:00.000Z'),
    patient: {
      patient_number: 'MRN-10001',
      user: {
        core_profiles_user_id: [{ first_name: 'Amina', last_name: 'Wanjiru' }],
      },
    },
    consultation: {
      appointment_id: 'appt-1',
      doctor_id: DOC,
      doctor: {
        user: {
          core_profiles_user_id: [{ first_name: 'Jane', last_name: 'Doe' }],
        },
      },
    },
    ...overrides,
  };
}

describe('PrismaFollowUpRepository', () => {
  let prisma: any;
  let repo: PrismaFollowUpRepository;

  beforeEach(() => {
    prisma = {
      followUps: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      consultations: { findFirst: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    repo = new PrismaFollowUpRepository(prisma);
  });

  it('creates then updates via save and maps display names', async () => {
    const entity = FollowUp.create({
      patientId: PAT,
      consultationId: CONS,
      followUpDate: '2026-08-20',
      reason: 'ANC review',
      followUpType: 'Review',
      notes: 'Bring booklet',
      createdBy: USER,
    });

    prisma.followUps.findFirst.mockResolvedValueOnce(null);
    prisma.followUps.create.mockResolvedValue(followUpRow());
    const created = await repo.save(entity);
    expect(created.getPatientId()).toBe(PAT);
    expect(created.getDisplay().patientName).toBe('Amina Wanjiru');
    expect(created.getDisplay().doctorName).toBe('Dr. Jane Doe');
    expect(prisma.followUps.create).toHaveBeenCalled();

    prisma.followUps.findFirst.mockResolvedValueOnce({ id: entity.getId() });
    prisma.followUps.update.mockResolvedValue(
      followUpRow({ follow_up_type: null, notes: null, reason: 'Follow up' }),
    );
    const updated = await repo.save(entity);
    expect(updated.getReason()).toBe('Follow up');
    expect(prisma.followUps.update).toHaveBeenCalled();
  });

  it('findById / findByIdScoped / findAll / exists / softDelete / delete', async () => {
    prisma.followUps.findFirst.mockResolvedValue(followUpRow());
    expect((await repo.findById(UUID))?.getId()).toBe(UUID);

    prisma.followUps.findFirst.mockResolvedValueOnce(null);
    expect(await repo.findByIdScoped(UUID, { doctorStaffId: DOC })).toBeNull();
    expect(prisma.followUps.findFirst.mock.calls.at(-1)[0].where).toEqual(
      expect.objectContaining({
        consultation: { doctor_id: DOC, deleted_at: null },
      }),
    );

    prisma.followUps.findMany.mockResolvedValue([followUpRow()]);
    const all = await repo.findAll();
    expect(all).toHaveLength(1);

    prisma.followUps.count.mockResolvedValue(1);
    expect(await repo.exists(UUID)).toBe(true);
    prisma.followUps.count.mockResolvedValue(0);
    expect(await repo.exists(UUID)).toBe(false);

    prisma.followUps.update.mockResolvedValue({});
    await repo.softDelete(UUID);
    await repo.delete(UUID);
    expect(prisma.followUps.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: FollowUpStatus.CANCELLED },
      }),
    );
  });

  it('findMany builds filters for status, doctor, dates, search, and scope', async () => {
    prisma.followUps.count.mockResolvedValue(1);
    prisma.followUps.findMany.mockResolvedValue([followUpRow()]);

    const page = await repo.findMany(
      {
        page: 2,
        limit: 10,
        status: FollowUpStatus.COMPLETED,
        doctorId: DOC,
        from: '2026-08-01',
        to: '2026-08-31',
        search: 'Amina',
      },
      { doctorStaffId: DOC },
    );
    expect(page.total).toBe(1);
    expect(page.items[0].getId()).toBe(UUID);
    expect(prisma.$transaction).toHaveBeenCalled();
    const where = prisma.followUps.count.mock.calls[0][0].where;
    expect(where.AND?.length ?? 0).toBeGreaterThanOrEqual(2);

    prisma.followUps.count.mockClear();
    prisma.followUps.findMany.mockResolvedValue([]);
    await repo.findMany({ page: 1, limit: 20 });
    const defaultWhere = prisma.followUps.count.mock.calls[0][0].where;
    expect(defaultWhere).toEqual(
      expect.objectContaining({
        NOT: { status: FollowUpStatus.CANCELLED },
      }),
    );
  });

  it('getSummary returns month / due / overdue counts', async () => {
    prisma.$transaction.mockResolvedValue([3, 1, 2, 4]);
    const summary = await repo.getSummary({ doctorStaffId: DOC });
    expect(summary).toEqual({
      scheduledThisMonth: 3,
      completedThisMonth: 1,
      dueWithin7Days: 2,
      overdue: 4,
    });
  });

  it('findByConsultationAndDate and findLatestConsultationId', async () => {
    prisma.followUps.findFirst.mockResolvedValue(followUpRow());
    const found = await repo.findByConsultationAndDate(
      CONS,
      new Date('2026-08-20T15:00:00.000Z'),
    );
    expect(found?.getConsultationId()).toBe(CONS);
    expect(prisma.followUps.findFirst.mock.calls[0][0].where.follow_up_date).toEqual(
      expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
    );

    prisma.consultations.findFirst.mockResolvedValue({ id: CONS });
    expect(await repo.findLatestConsultationId(PAT)).toBe(CONS);
    prisma.consultations.findFirst.mockResolvedValue(null);
    expect(await repo.findLatestConsultationId(PAT)).toBeNull();
  });

  it('toDomain falls back to patient number when profile missing', async () => {
    prisma.followUps.findFirst.mockResolvedValue(
      followUpRow({
        follow_up_type: '  ',
        patient: { patient_number: 'MRN-9', user: { core_profiles_user_id: [] } },
        consultation: { appointment_id: null, doctor_id: DOC, doctor: null },
      }),
    );
    const row = await repo.findById(UUID);
    expect(row?.getDisplay().patientName).toBe('MRN-9');
    expect(row?.getDisplay().doctorName).toBe('');
  });
});
