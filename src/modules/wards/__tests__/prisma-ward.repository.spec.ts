/**
 * PrismaWardRepository — create/update/query with Prisma mocks.
 */

import { BadRequestException } from '@nestjs/common';
import { PrismaWardRepository } from '../repositories/prisma/prisma-ward.repository';
import { Ward } from '../domain/ward.entity';

describe('PrismaWardRepository', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  const id = 'ward-1';

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id,
      name: 'General A',
      ward_type: 'GENERAL',
      department_id: 'dep1',
      daily_rate: { toNumber: () => 1500 },
      capacity: 20,
      is_active: true,
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  let prisma: Record<string, any>;
  let repo: PrismaWardRepository;

  beforeEach(() => {
    prisma = {
      wards: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row({ name: 'General B' })),
        findMany: jest.fn().mockResolvedValue([row()]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
    repo = new PrismaWardRepository(prisma as never);
  });

  it('rejects invalid ward type', async () => {
    const bad = Ward.create({ name: 'X', wardType: 'ORBITAL' });
    await expect(repo.save(bad)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates and updates wards', async () => {
    const created = await repo.save(
      Ward.create({
        name: 'General A',
        wardType: 'GENERAL',
        departmentId: 'dep1',
        dailyRate: 1500,
        capacity: 20,
      }),
    );
    expect(prisma.wards.create).toHaveBeenCalled();
    expect(created.getDailyRate()).toBe(1500);

    prisma.wards.findFirst.mockResolvedValueOnce(row());
    const entity = Ward.reconstitute(
      id,
      {
        name: Ward.create({ name: 'General B' }).getName(),
        wardType: 'ICU',
        departmentId: 'dep1',
        dailyRate: 2000,
        capacity: 10,
        isActive: true,
      },
      now,
      now,
    );
    await repo.save(entity);
    expect(prisma.wards.update).toHaveBeenCalled();
  });

  it('findById, findAll, exists, softDelete, delete', async () => {
    prisma.wards.findFirst.mockResolvedValueOnce(row());
    expect((await repo.findById(id))?.getId()).toBe(id);

    prisma.wards.findFirst.mockResolvedValueOnce(null);
    expect(await repo.findById('missing')).toBeNull();

    expect(await repo.findAll()).toHaveLength(1);
    expect(await repo.exists(id)).toBe(true);
    prisma.wards.count.mockResolvedValueOnce(0);
    expect(await repo.exists('x')).toBe(false);

    await repo.softDelete(id);
    expect(prisma.wards.update).toHaveBeenCalledWith({
      where: { id },
      data: { is_active: false },
    });
    await repo.delete(id);
  });

  it('findMany with search and numeric daily_rate mapping', async () => {
    const page = await repo.findMany({
      page: 1,
      limit: 10,
      search: 'Gen',
    } as never);
    expect(page.items[0].getName().getValue()).toBe('General A');

    prisma.wards.findFirst.mockResolvedValueOnce(
      row({ daily_rate: '2500.50', department_id: null }),
    );
    const found = await repo.findById(id);
    expect(found?.getDailyRate()).toBe(2500.5);
    expect(found?.getDepartmentId()).toBeNull();

    await repo.findMany({} as never);
  });
});
