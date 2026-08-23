/**
 * PrismaInsurancePolicyRepository — create/update/query with Prisma mocks.
 */

import { PrismaInsurancePolicyRepository } from '../repositories/prisma/prisma-insurance-policy.repository';
import { InsurancePolicy } from '../domain/insurance-policy.entity';

describe('PrismaInsurancePolicyRepository', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  const id = 'pol-1';

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id,
      patient_id: 'pat1',
      provider_id: 'prov1',
      policy_number: 'POL-001',
      group_number: 'G1',
      member_type: 'PRINCIPAL',
      principal_policy_id: null,
      start_date: new Date('2026-01-01'),
      expiry_date: new Date('2026-12-31'),
      copay_amount: { toNumber: () => 500 },
      is_active: true,
      created_at: now,
      updated_at: now,
      ...overrides,
    };
  }

  let prisma: Record<string, any>;
  let repo: PrismaInsurancePolicyRepository;

  beforeEach(() => {
    prisma = {
      insurancePolicies: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row({ group_number: 'G2' })),
        findMany: jest.fn().mockResolvedValue([row()]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      ),
    };
    repo = new PrismaInsurancePolicyRepository(prisma as never);
  });

  it('creates and updates policies', async () => {
    const created = await repo.save(
      InsurancePolicy.create({
        name: 'POL-001',
        patientId: 'pat1',
        providerId: 'prov1',
        startDate: '2026-01-01',
        expiryDate: '2026-12-31',
        groupNumber: 'G1',
        copayAmount: 500,
      }),
    );
    expect(prisma.insurancePolicies.create).toHaveBeenCalled();
    expect(created.getCopayAmount()).toBe(500);

    prisma.insurancePolicies.findFirst.mockResolvedValueOnce(row());
    const existing = InsurancePolicy.reconstitute(
      id,
      {
        name: InsurancePolicy.create({
          name: 'POL-001',
          patientId: 'pat1',
          providerId: 'prov1',
          startDate: '2026-01-01',
          expiryDate: '2026-12-31',
        }).getName(),
        patientId: 'pat1',
        providerId: 'prov1',
        groupNumber: 'G2',
        memberType: 'PRINCIPAL',
        principalPolicyId: null,
        startDate: new Date('2026-01-01'),
        expiryDate: new Date('2026-12-31'),
        copayAmount: 500,
        isActive: true,
      },
      now,
      now,
    );
    await repo.save(existing);
    expect(prisma.insurancePolicies.update).toHaveBeenCalled();
  });

  it('findById, findAll, exists, softDelete, delete', async () => {
    prisma.insurancePolicies.findFirst.mockResolvedValueOnce(row());
    expect((await repo.findById(id))?.getId()).toBe(id);

    prisma.insurancePolicies.findFirst.mockResolvedValueOnce(null);
    expect(await repo.findById('missing')).toBeNull();

    expect(await repo.findAll()).toHaveLength(1);
    expect(await repo.exists(id)).toBe(true);
    prisma.insurancePolicies.count.mockResolvedValueOnce(0);
    expect(await repo.exists('x')).toBe(false);

    await repo.softDelete(id);
    expect(prisma.insurancePolicies.update).toHaveBeenCalledWith({
      where: { id },
      data: { is_active: false },
    });
    await repo.delete(id);
  });

  it('findMany with and without search; maps numeric copay', async () => {
    const page = await repo.findMany({
      page: 1,
      limit: 10,
      search: 'POL',
    } as never);
    expect(page.total).toBe(1);
    expect(page.items[0].getName().getValue()).toBe('POL-001');

    prisma.insurancePolicies.findFirst.mockResolvedValueOnce(
      row({ copay_amount: '750', group_number: null }),
    );
    const found = await repo.findById(id);
    expect(found?.getCopayAmount()).toBe(750);

    prisma.insurancePolicies.findFirst.mockResolvedValueOnce(
      row({ copay_amount: null }),
    );
    expect((await repo.findById(id))?.getCopayAmount()).toBe(0);

    await repo.findMany({} as never);
  });
});
