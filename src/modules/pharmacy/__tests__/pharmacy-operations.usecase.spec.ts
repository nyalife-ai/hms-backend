/**
 * Pharmacy operations unit tests — catalog + stock mutations.
 */

import { BadRequestException, ConflictException } from '@nestjs/common';
import { PharmacyOperationsUseCase } from '../use-cases/pharmacy-operations.usecase';

describe('PharmacyOperationsUseCase', () => {
  let prisma: any;
  let ops: PharmacyOperationsUseCase;

  beforeEach(() => {
    prisma = {
      suppliers: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      categories: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      medications: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      batches: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      stockMovements: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      prescriptions: { count: jest.fn() },
      purchaseOrders: { count: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    ops = new PharmacyOperationsUseCase(prisma, {
      recordMutation: jest.fn().mockResolvedValue(undefined),
    } as any);
    jest.clearAllMocks();
  });

  it('rejects invalid medication form', async () => {
    await expect(
      ops.createMedication({ medicationName: 'X', form: 'PILL' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects negative selling price', async () => {
    await expect(
      ops.createMedication({
        medicationName: 'X',
        standardSellingPrice: -1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates category', async () => {
    prisma.categories.create.mockResolvedValue({
      id: 'c1',
      category_name: 'Antibiotics',
      description: null,
      is_active: true,
    });
    const row = await ops.createCategory({ categoryName: 'Antibiotics' });
    expect(row.categoryName).toBe('Antibiotics');
  });

  it('adjusts stock down transactionally', async () => {
    prisma.batches.findFirst.mockResolvedValue({
      id: 'b1',
      quantity_on_hand: 10,
    });
    prisma.batches.updateMany.mockResolvedValue({ count: 1 });
    prisma.stockMovements.create.mockResolvedValue({
      id: 'm1',
      batch_id: 'b1',
      movement_type: 'ADJUSTMENT',
      quantity_change: -3,
    });

    const result = await ops.adjustStock({
      batchId: 'b1',
      quantityChange: -3,
      reason: 'Count correction',
      performedBy: 'u1',
    });

    expect(result.movementType).toBe('ADJUSTMENT');
    expect(prisma.batches.updateMany).toHaveBeenCalled();
  });

  it('rejects damage with insufficient stock', async () => {
    prisma.batches.findFirst.mockResolvedValue({
      id: 'b1',
      quantity_on_hand: 1,
    });
    prisma.batches.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      ops.damageStock({
        batchId: 'b1',
        quantity: 5,
        reason: 'Broken',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects expiry write-off for non-expired batch', async () => {
    prisma.batches.findFirst.mockResolvedValue({
      id: 'b1',
      medication_id: 'm1',
      batch_number: 'B1',
      quantity_on_hand: 5,
      unit_cost: 1,
      selling_price: 2,
      manufacturing_date: null,
      expiry_date: new Date(Date.now() + 86400000 * 30),
      supplier_id: null,
      notes: null,
      created_by: 'u1',
      medication: { medication_name: 'Amox' },
      supplier: null,
    });
    await expect(
      ops.writeOffExpiry({ batchId: 'b1', performedBy: 'u1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
