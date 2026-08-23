/**
 * Pharmacy operations unit tests — catalog + stock mutations.
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PharmacyOperationsUseCase } from '../use-cases/pharmacy-operations.usecase';

function medRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    medication_name: 'Amox',
    generic_name: 'Amoxicillin',
    category_id: 'c1',
    form: 'CAPSULE',
    strength: '500mg',
    unit: 'cap',
    standard_selling_price: 50,
    description: null,
    side_effects: null,
    contraindications: null,
    is_active: true,
    category: { category_name: 'Antibiotics' },
    pharmacy_batches_medication_id: [
      {
        quantity_on_hand: 10,
        expiry_date: new Date('2027-01-01'),
        id: 'b1',
        medication_id: 'm1',
        batch_number: 'LOT1',
        unit_cost: 5,
        selling_price: 10,
        manufacturing_date: null,
        supplier_id: null,
        notes: null,
        created_by: 'u1',
        supplier: null,
      },
    ],
    ...overrides,
  };
}

function batchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    medication_id: 'm1',
    batch_number: 'LOT1',
    quantity_on_hand: 10,
    unit_cost: 5,
    selling_price: 10,
    manufacturing_date: null,
    expiry_date: new Date(Date.now() + 86400000 * 30),
    supplier_id: null,
    notes: null,
    created_by: 'u1',
    medication: { medication_name: 'Amox' },
    supplier: null,
    rel_created_by: {
      core_profiles_user_id: [{ first_name: 'Pharm', last_name: 'Tech' }],
    },
    ...overrides,
  };
}

describe('PharmacyOperationsUseCase', () => {
  let prisma: any;
  let audit: { recordMutation: jest.Mock };
  let ops: PharmacyOperationsUseCase;

  beforeEach(() => {
    prisma = {
      suppliers: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      categories: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      medications: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      batches: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      stockMovements: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      prescriptions: { count: jest.fn().mockResolvedValue(0) },
      purchaseOrders: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
    ops = new PharmacyOperationsUseCase(prisma, audit as any);
    jest.clearAllMocks();
  });

  it('overview returns pharmacy board counts', async () => {
    prisma.medications.count.mockResolvedValue(5);
    prisma.suppliers.count.mockResolvedValue(2);
    prisma.prescriptions.count.mockResolvedValue(3);
    prisma.purchaseOrders.count.mockResolvedValue(1);
    prisma.batches.count.mockResolvedValue(4);
    prisma.stockMovements.count.mockResolvedValue(7);
    const board = await ops.overview();
    expect(board.medications).toBe(5);
    expect(board.pendingPrescriptions).toBe(3);
    expect(board.todaysDispenses).toBe(7);
  });

  it('suppliers CRUD', async () => {
    await expect(
      ops.createSupplier({ companyName: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.suppliers.create.mockResolvedValue({
      id: 's1',
      company_name: 'Acme',
      contact_person: null,
      phone: null,
      email: null,
      address: null,
      is_active: true,
    });
    const created = await ops.createSupplier({
      companyName: 'Acme',
      actorUserId: 'u1',
    });
    expect(created.companyName).toBe('Acme');

    prisma.suppliers.findMany.mockResolvedValue([
      {
        id: 's1',
        company_name: 'Acme',
        contact_person: 'Bob',
        phone: '1',
        email: 'a@x.com',
        address: null,
        is_active: true,
      },
    ]);
    prisma.suppliers.count.mockResolvedValue(1);
    const listed = await ops.listSuppliers({
      active: true,
      search: 'Acme',
      page: 1,
      limit: 20,
    });
    expect(listed.items[0].contactPerson).toBe('Bob');

    prisma.suppliers.findFirst.mockResolvedValue(null);
    await expect(ops.getSupplier('x')).rejects.toBeInstanceOf(NotFoundException);

    prisma.suppliers.findFirst.mockResolvedValue({
      id: 's1',
      company_name: 'Acme',
      contact_person: null,
      phone: null,
      email: null,
      address: null,
      is_active: true,
    });
    prisma.suppliers.update.mockResolvedValue({
      id: 's1',
      company_name: 'Acme2',
      contact_person: 'Ann',
      phone: '2',
      email: 'b@x.com',
      address: 'x',
      is_active: false,
    });
    const updated = await ops.updateSupplier('s1', {
      companyName: 'Acme2',
      contactPerson: 'Ann',
      phone: '2',
      email: 'b@x.com',
      address: 'x',
      isActive: false,
      actorUserId: 'u1',
    });
    expect(updated.companyName).toBe('Acme2');
    await ops.setSupplierActive('s1', true, 'u1');
  });

  it('categories CRUD with conflict mapping', async () => {
    await expect(
      ops.createCategory({ categoryName: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.categories.create.mockResolvedValue({
      id: 'c1',
      category_name: 'Antibiotics',
      description: null,
      is_active: true,
    });
    const row = await ops.createCategory({ categoryName: 'Antibiotics' });
    expect(row.categoryName).toBe('Antibiotics');

    const { Prisma } = require('../../../generated/prisma');
    prisma.categories.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      ops.createCategory({ categoryName: 'Antibiotics' }),
    ).rejects.toBeInstanceOf(ConflictException);
    prisma.categories.create.mockRejectedValue(new Error('boom'));
    await expect(
      ops.createCategory({ categoryName: 'X' }),
    ).rejects.toThrow('boom');

    prisma.categories.findMany.mockResolvedValue([
      {
        id: 'c1',
        category_name: 'Antibiotics',
        description: null,
        is_active: true,
      },
    ]);
    expect((await ops.listCategories(true))[0].id).toBe('c1');

    prisma.categories.findFirst.mockResolvedValue(null);
    await expect(ops.getCategory('x')).rejects.toBeInstanceOf(NotFoundException);

    prisma.categories.findFirst.mockResolvedValue({
      id: 'c1',
      category_name: 'Antibiotics',
      description: null,
      is_active: true,
    });
    prisma.categories.update.mockResolvedValue({
      id: 'c1',
      category_name: 'Abx',
      description: 'd',
      is_active: false,
    });
    const updated = await ops.updateCategory('c1', {
      categoryName: 'Abx',
      description: 'd',
      isActive: false,
      actorUserId: 'u1',
    });
    expect(updated.categoryName).toBe('Abx');

    prisma.categories.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      ops.updateCategory('c1', { categoryName: 'Dup' }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.categories.update.mockRejectedValue(new Error('cat fail'));
    await expect(
      ops.updateCategory('c1', { categoryName: 'Other' }),
    ).rejects.toThrow('cat fail');
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

  it('medications list/get/create/update/softDelete', async () => {
    await expect(
      ops.listMedications({ form: 'PILL' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.medications.findMany.mockResolvedValue([medRow()]);
    prisma.medications.count.mockResolvedValue(1);
    const listed = await ops.listMedications({
      search: 'Amox',
      categoryId: 'c1',
      form: 'capsule',
      active: true,
    });
    expect(listed.items[0].quantityOnHand).toBe(10);

    prisma.medications.findFirst.mockResolvedValue(null);
    await expect(ops.getMedication('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.medications.findFirst.mockResolvedValue(medRow());
    expect((await ops.getMedication('m1')).medicationName).toBe('Amox');

    await expect(
      ops.createMedication({ medicationName: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.categories.findFirst.mockResolvedValue({
      id: 'c1',
      category_name: 'Antibiotics',
      description: null,
      is_active: true,
    });
    prisma.medications.create.mockResolvedValue({ id: 'm1' });
    prisma.medications.findFirst.mockResolvedValue(medRow());
    const created = await ops.createMedication({
      medicationName: 'Amox',
      form: 'capsule',
      categoryId: 'c1',
      standardSellingPrice: 50,
      actorUserId: 'u1',
    });
    expect(created.id).toBe('m1');

    const { Prisma } = require('../../../generated/prisma');
    prisma.medications.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      ops.createMedication({ medicationName: 'Amox' }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.medications.create.mockRejectedValue(new Error('med fail'));
    await expect(
      ops.createMedication({ medicationName: 'Other' }),
    ).rejects.toThrow('med fail');

    prisma.medications.findFirst.mockResolvedValue(medRow());
    await expect(
      ops.updateMedication('m1', { form: 'PILL' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.updateMedication('m1', { standardSellingPrice: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.medications.update.mockResolvedValue({});
    prisma.medications.findFirst.mockResolvedValue(medRow({ medication_name: 'Amox2' }));
    const updated = await ops.updateMedication('m1', {
      medicationName: 'Amox2',
      form: 'tablet',
      genericName: 'g',
      categoryId: null,
      strength: '250',
      unit: 'tab',
      standardSellingPrice: 40,
      description: 'd',
      sideEffects: 's',
      contraindications: 'c',
      isActive: true,
      actorUserId: 'u1',
    });
    expect(updated.medicationName).toBe('Amox2');

    prisma.medications.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      ops.updateMedication('m1', { medicationName: 'Dup' }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.medications.update.mockRejectedValue(new Error('upd fail'));
    await expect(
      ops.updateMedication('m1', { medicationName: 'Other' }),
    ).rejects.toThrow('upd fail');

    prisma.medications.update.mockResolvedValue({});
    prisma.medications.findFirst.mockResolvedValue(medRow());
    expect(await ops.softDeleteMedication('m1', 'u1')).toEqual({
      id: 'm1',
      deleted: true,
    });
  });

  it('batches list/get/create/updateMeta', async () => {
    prisma.batches.findMany.mockResolvedValue([batchRow()]);
    prisma.batches.count.mockResolvedValue(1);
    const listed = await ops.listBatches({
      medicationId: 'm1',
      withStock: true,
      search: 'LOT',
      expiredOnly: false,
      expiringBefore: new Date('2028-01-01'),
    });
    expect(listed.items[0].batchNumber).toBe('LOT1');

    prisma.batches.findFirst.mockResolvedValue(null);
    await expect(ops.getBatch('x')).rejects.toBeInstanceOf(NotFoundException);

    prisma.batches.findFirst.mockResolvedValue(batchRow());
    expect((await ops.getBatch('b1')).id).toBe('b1');

    await expect(
      ops.createBatch({
        medicationId: 'm1',
        batchNumber: '  ',
        quantityOnHand: 1,
        expiryDate: '2027-01-01',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.createBatch({
        medicationId: 'm1',
        batchNumber: 'L1',
        quantityOnHand: -1,
        expiryDate: '2027-01-01',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.createBatch({
        medicationId: 'm1',
        batchNumber: 'L1',
        quantityOnHand: 1,
        unitCost: -1,
        expiryDate: '2027-01-01',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.medications.findFirst.mockResolvedValue(medRow());
    prisma.suppliers.findFirst.mockResolvedValue({
      id: 's1',
      company_name: 'Acme',
      contact_person: null,
      phone: null,
      email: null,
      address: null,
      is_active: true,
    });
    prisma.batches.create.mockResolvedValue({ id: 'b2' });
    prisma.stockMovements.create.mockResolvedValue({});
    prisma.batches.findFirst.mockResolvedValue(batchRow({ id: 'b2' }));
    const created = await ops.createBatch({
      medicationId: 'm1',
      batchNumber: 'LOT2',
      quantityOnHand: 5,
      supplierId: 's1',
      expiryDate: '2027-06-01',
      manufacturingDate: '2026-01-01',
      createdBy: 'u1',
    });
    expect(created.id).toBe('b2');
    expect(prisma.stockMovements.create).toHaveBeenCalled();

    const { Prisma } = require('../../../generated/prisma');
    prisma.batches.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      ops.createBatch({
        medicationId: 'm1',
        batchNumber: 'LOT2',
        quantityOnHand: 0,
        expiryDate: '2027-06-01',
        createdBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.batches.create.mockRejectedValue(new Error('batch fail'));
    await expect(
      ops.createBatch({
        medicationId: 'm1',
        batchNumber: 'LOT3',
        quantityOnHand: 0,
        expiryDate: '2027-06-01',
        createdBy: 'u1',
      }),
    ).rejects.toThrow('batch fail');

    prisma.batches.findFirst.mockResolvedValue(batchRow());
    await expect(
      ops.updateBatchMeta('b1', { sellingPrice: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.batches.update.mockResolvedValue({});
    prisma.batches.findFirst.mockResolvedValue(batchRow({ notes: 'n' }));
    const meta = await ops.updateBatchMeta('b1', {
      notes: 'n',
      sellingPrice: 12,
      unitCost: 6,
      actorUserId: 'u1',
    });
    expect(meta.notes).toBe('n');
  });

  it('lists movements and stock delta mutations', async () => {
    prisma.stockMovements.findMany.mockResolvedValue([
      {
        id: 'mv1',
        batch_id: 'b1',
        movement_type: 'ADJUSTMENT',
        quantity_change: -1,
        reference_type: 'ADJUSTMENT',
        reference_id: null,
        notes: 'fix',
        performed_by: 'u1',
        created_at: new Date(),
        batch: {
          batch_number: 'LOT1',
          medication: { medication_name: 'Amox' },
        },
        rel_performed_by: {
          core_profiles_user_id: [{ first_name: 'A', last_name: 'B' }],
        },
      },
    ]);
    const moves = await ops.listMovements({
      batchId: 'b1',
      movementType: 'adjustment',
      take: 10,
    });
    expect(moves[0].medicationName).toBe('Amox');

    await expect(
      ops.adjustStock({
        batchId: 'b1',
        quantityChange: 0,
        reason: 'x',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.adjustStock({
        batchId: 'b1',
        quantityChange: 1,
        reason: '  ',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.batches.findFirst.mockResolvedValue({ id: 'b1', quantity_on_hand: 10 });
    prisma.batches.update.mockResolvedValue({});
    prisma.stockMovements.create.mockResolvedValue({
      id: 'm2',
      batch_id: 'b1',
      movement_type: 'ADJUSTMENT',
      quantity_change: 2,
    });
    const up = await ops.adjustStock({
      batchId: 'b1',
      quantityChange: 2,
      reason: 'found',
      performedBy: 'u1',
    });
    expect(up.quantityChange).toBe(2);

    await expect(
      ops.damageStock({
        batchId: 'b1',
        quantity: 0,
        reason: 'x',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.damageStock({
        batchId: 'b1',
        quantity: 1,
        reason: '  ',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.returnStock({
        batchId: 'b1',
        quantity: 0,
        reason: 'x',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ops.returnStock({
        batchId: 'b1',
        quantity: 1,
        reason: '  ',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.stockMovements.create.mockResolvedValue({
      id: 'm3',
      batch_id: 'b1',
      movement_type: 'RETURN',
      quantity_change: 1,
    });
    const ret = await ops.returnStock({
      batchId: 'b1',
      quantity: 1,
      reason: 'patient return',
      performedBy: 'u1',
      referenceId: 'rx1',
    });
    expect(ret.movementType).toBe('RETURN');
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
    prisma.batches.findFirst.mockResolvedValue(batchRow());
    await expect(
      ops.writeOffExpiry({ batchId: 'b1', performedBy: 'u1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes off expired stock', async () => {
    prisma.batches.findFirst.mockResolvedValue(
      batchRow({
        expiry_date: new Date(Date.now() - 86400000),
        quantity_on_hand: 0,
      }),
    );
    await expect(
      ops.writeOffExpiry({ batchId: 'b1', performedBy: 'u1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.batches.findFirst
      .mockResolvedValueOnce(
        batchRow({
          expiry_date: new Date(Date.now() - 86400000),
          quantity_on_hand: 4,
        }),
      )
      .mockResolvedValueOnce(
        batchRow({
          expiry_date: new Date(Date.now() - 86400000),
          quantity_on_hand: 4,
        }),
      );
    prisma.batches.updateMany.mockResolvedValue({ count: 1 });
    prisma.stockMovements.create.mockResolvedValue({
      id: 'm4',
      batch_id: 'b1',
      movement_type: 'EXPIRY',
      quantity_change: -4,
    });
    const result = await ops.writeOffExpiry({
      batchId: 'b1',
      performedBy: 'u1',
    });
    expect(result.movementType).toBe('EXPIRY');
  });

  it('applyStockDelta throws when batch missing', async () => {
    prisma.batches.findFirst.mockResolvedValue(null);
    await expect(
      ops.adjustStock({
        batchId: 'missing',
        quantityChange: 1,
        reason: 'x',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
