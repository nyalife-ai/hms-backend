/**
 * PrismaVitalSignRepository — create/update/query with Prisma mocks.
 */

import { PrismaVitalSignRepository } from '../repositories/prisma/prisma-vital-sign.repository';
import { VitalSign } from '../domain/vital-sign.entity';

describe('PrismaVitalSignRepository', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  const id = 'vs-1';

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id,
      patient_id: 'pat1',
      consultation_id: null,
      blood_pressure: '120/80',
      heart_rate: 72,
      respiratory_rate: 16,
      temperature: { toNumber: () => 36.6 },
      weight: 70,
      height: '170',
      bmi: null,
      pain_level: 2,
      oxygen_saturation: 98,
      notes: 'ok',
      urgency_level: 'NORMAL',
      measured_at: now,
      recorded_by: 'nurse1',
      is_voided: false,
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  let prisma: Record<string, any>;
  let repo: PrismaVitalSignRepository;

  beforeEach(() => {
    prisma = {
      vitalSigns: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row({ heart_rate: 80 })),
        findMany: jest.fn().mockResolvedValue([row()]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
    repo = new PrismaVitalSignRepository(prisma as never);
  });

  it('creates new vital sign', async () => {
    const entity = VitalSign.create({
      patientId: 'pat1',
      recordedBy: 'nurse1',
      bloodPressure: '120/80',
      heartRate: 72,
      temperature: 36.6,
      notes: 'ok',
    });
    const saved = await repo.save(entity);
    expect(prisma.vitalSigns.create).toHaveBeenCalled();
    expect(saved.getBloodPressure()).toBe('120/80');
    expect(saved.getTemperature()).toBe(36.6);
  });

  it('updates existing vital sign', async () => {
    prisma.vitalSigns.findFirst.mockResolvedValueOnce(row());
    const entity = VitalSign.reconstitute(
      id,
      {
        name: VitalSign.create({
          patientId: 'pat1',
          recordedBy: 'nurse1',
          bloodPressure: '120/80',
        }).getName(),
        patientId: 'pat1',
        recordedBy: 'nurse1',
        bloodPressure: '120/80',
        heartRate: 80,
        urgencyLevel: 'NORMAL',
        measuredAt: now,
        isVoided: false,
      },
      now,
      now,
    );
    const saved = await repo.save(entity);
    expect(prisma.vitalSigns.update).toHaveBeenCalled();
    expect(saved.getHeartRate()).toBe(80);
  });

  it('findById, findAll, exists, softDelete, delete', async () => {
    prisma.vitalSigns.findFirst.mockResolvedValueOnce(row());
    expect((await repo.findById(id))?.getId()).toBe(id);

    prisma.vitalSigns.findFirst.mockResolvedValueOnce(null);
    expect(await repo.findById('missing')).toBeNull();

    expect(await repo.findAll()).toHaveLength(1);
    expect(await repo.exists(id)).toBe(true);
    prisma.vitalSigns.count.mockResolvedValueOnce(0);
    expect(await repo.exists('x')).toBe(false);

    await repo.softDelete(id);
    expect(prisma.vitalSigns.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id },
        data: expect.objectContaining({ is_voided: true }),
      }),
    );
    await repo.delete(id);
  });

  it('findMany with search filter', async () => {
    const page = await repo.findMany({
      page: 1,
      limit: 10,
      search: '120',
    } as never);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    await repo.findMany({} as never);
  });

  it('toDomain maps EMERGENCY urgency and label fallbacks', async () => {
    prisma.vitalSigns.findFirst.mockResolvedValueOnce(
      row({
        urgency_level: 'EMERGENCY',
        blood_pressure: '  ',
        notes: 'fever notes',
        temperature: null,
        weight: null,
        height: null,
        bmi: { toNumber: () => 22.1 },
      }),
    );
    const found = await repo.findById(id);
    expect(found?.getUrgencyLevel()).toBe('EMERGENCY');
    expect(found?.getName().getValue()).toBe('fever notes');
    expect(found?.getBmi()).toBe(22.1);

    prisma.vitalSigns.findFirst.mockResolvedValueOnce(
      row({
        blood_pressure: null,
        notes: null,
        urgency_level: 'OTHER',
      }),
    );
    const fallback = await repo.findById(id);
    expect(fallback?.getName().getValue()).toBe('Vitals');
    expect(fallback?.getUrgencyLevel()).toBe('NORMAL');
  });
});
