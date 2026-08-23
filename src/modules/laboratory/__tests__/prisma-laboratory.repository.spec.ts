/**
 * PrismaLaboratoryRepository — create/update/query with Prisma mocks.
 */

import { PrismaLaboratoryRepository } from '../repositories/prisma/prisma-laboratory.repository';
import { Laboratory } from '../domain/laboratory.entity';

describe('PrismaLaboratoryRepository', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  const uuid = '11111111-1111-4111-8111-111111111111';

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: uuid,
      request_number: 'LAB-2026-0001',
      notes: 'CBC',
      status: 'PENDING',
      patient_id: 'pat1',
      requested_by: 'doc1',
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  let prisma: Record<string, any>;
  let repo: PrismaLaboratoryRepository;

  beforeEach(() => {
    prisma = {
      laboratoryRequests: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(row({ notes: 'updated' })),
        create: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([row()]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
    repo = new PrismaLaboratoryRepository(prisma as never);
  });

  it('rejects save without patientId or requestedBy', async () => {
    const entity = Laboratory.create({ name: 'Lab' });
    await expect(repo.save(entity)).rejects.toThrow(
      'Use POST /laboratory/requests',
    );
  });

  it('creates new request when id is not an existing UUID row', async () => {
    const entity = Laboratory.create({
      name: 'LAB-CUSTOM',
      description: 'notes',
      patientId: 'pat1',
      requestedBy: 'doc1',
    });
    const saved = await repo.save(entity);
    expect(prisma.laboratoryRequests.create).toHaveBeenCalled();
    expect(saved.getPatientId()).toBe('pat1');
    expect(saved.getName().getValue()).toBe('LAB-2026-0001');
  });

  it('generates request number when name empty on create', async () => {
    const entity = Laboratory.reconstitute(
      'not-a-uuid',
      {
        name: Laboratory.create({ name: 'x' }).getName(),
        description: null as never,
        patientId: 'pat1',
        requestedBy: 'doc1',
      },
      now,
      now,
    );
    // Force empty name via create with whitespace-trimmed empty fallback path:
    const emptyNameEntity = Laboratory.create({
      name: 'TEMP',
      patientId: 'pat1',
      requestedBy: 'doc1',
    });
    jest.spyOn(emptyNameEntity, 'getName').mockReturnValue({
      getValue: () => '',
    } as never);
    jest.spyOn(emptyNameEntity, 'getId').mockReturnValue('temp-id');
    await repo.save(emptyNameEntity);
    expect(prisma.laboratoryRequests.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          request_number: expect.stringMatching(/^LAB-\d{4}-\d{4}$/),
        }),
      }),
    );
  });

  it('updates existing UUID request', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValueOnce(row());
    const entity = Laboratory.reconstitute(
      uuid,
      {
        name: Laboratory.create({ name: 'LAB-2026-0001' }).getName(),
        description: 'updated',
        patientId: 'pat1',
        requestedBy: 'doc1',
      },
      now,
      now,
    );
    const saved = await repo.save(entity);
    expect(prisma.laboratoryRequests.update).toHaveBeenCalled();
    expect(saved.getDescription()).toBe('updated');
  });

  it('findById, findAll, exists, softDelete, delete', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValueOnce(row());
    expect((await repo.findById(uuid))?.getId()).toBe(uuid);

    prisma.laboratoryRequests.findFirst.mockResolvedValueOnce(null);
    expect(await repo.findById('missing')).toBeNull();

    const all = await repo.findAll();
    expect(all).toHaveLength(1);

    expect(await repo.exists(uuid)).toBe(true);
    prisma.laboratoryRequests.count.mockResolvedValueOnce(0);
    expect(await repo.exists('x')).toBe(false);

    await repo.softDelete(uuid);
    expect(prisma.laboratoryRequests.update).toHaveBeenCalledWith({
      where: { id: uuid },
      data: { status: 'CANCELLED' },
    });

    await repo.delete(uuid);
  });

  it('findMany paginates via transaction', async () => {
    const page = await repo.findMany({ page: 1, limit: 10 } as never);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
  });

  it('toDomain falls back when request_number empty', async () => {
    prisma.laboratoryRequests.findFirst.mockResolvedValueOnce(
      row({ request_number: '   ', notes: null }),
    );
    const found = await repo.findById(uuid);
    expect(found?.getName().getValue()).toMatch(/^Lab /);
    expect(found?.getDescription()).toBe('PENDING');
  });
});
