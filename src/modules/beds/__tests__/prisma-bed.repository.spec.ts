/**
 * PrismaBedRepository — create/update/query with Prisma mocks.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaBedRepository } from '../repositories/prisma/prisma-bed.repository';
import { Bed } from '../domain/bed.entity';

describe('PrismaBedRepository', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  const bedId = 'bed-1';
  const wardId = 'ward-1';

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: bedId,
      ward_id: wardId,
      bed_number: 'B1',
      status: 'AVAILABLE',
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  let prisma: Record<string, any>;
  let repo: PrismaBedRepository;

  beforeEach(() => {
    prisma = {
      wards: {
        findFirst: jest.fn().mockResolvedValue({ id: wardId, is_active: true }),
      },
      beds: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row({ status: 'OCCUPIED' })),
        findMany: jest.fn().mockResolvedValue([row()]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
    repo = new PrismaBedRepository(prisma as never);
  });

  it('rejects invalid status and missing ward', async () => {
    const bad = Bed.create({ name: 'B1', wardId, status: 'BROKEN' });
    await expect(repo.save(bad)).rejects.toBeInstanceOf(BadRequestException);

    prisma.wards.findFirst.mockResolvedValueOnce(null);
    const ok = Bed.create({ name: 'B1', wardId });
    await expect(repo.save(ok)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates new bed when not existing', async () => {
    const entity = Bed.create({ name: 'B1', wardId, status: 'AVAILABLE' });
    const saved = await repo.save(entity);
    expect(prisma.beds.create).toHaveBeenCalled();
    expect(saved.getName().getValue()).toBe('B1');
    expect(saved.getWardId()).toBe(wardId);
  });

  it('updates existing bed', async () => {
    prisma.beds.findFirst.mockResolvedValueOnce(row());
    const entity = Bed.reconstitute(
      bedId,
      {
        name: Bed.create({ name: 'B1', wardId }).getName(),
        wardId,
        status: 'OCCUPIED',
      },
      now,
      now,
    );
    const saved = await repo.save(entity);
    expect(prisma.beds.update).toHaveBeenCalled();
    expect(saved.getStatus()).toBe('OCCUPIED');
  });

  it('findById, findAll, exists, softDelete, delete', async () => {
    prisma.beds.findFirst.mockResolvedValueOnce(row());
    expect((await repo.findById(bedId))?.getId()).toBe(bedId);

    prisma.beds.findFirst.mockResolvedValueOnce(null);
    expect(await repo.findById('missing')).toBeNull();

    expect(await repo.findAll()).toHaveLength(1);
    expect(await repo.exists(bedId)).toBe(true);
    prisma.beds.count.mockResolvedValueOnce(0);
    expect(await repo.exists('x')).toBe(false);

    await repo.softDelete(bedId);
    expect(prisma.beds.update).toHaveBeenCalledWith({
      where: { id: bedId },
      data: { status: 'MAINTENANCE' },
    });
    await repo.delete(bedId);
  });

  it('findMany with and without search', async () => {
    const page = await repo.findMany({
      page: 1,
      limit: 10,
      search: 'B',
    } as never);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);

    await repo.findMany({} as never);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
