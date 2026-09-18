/**
 * Pharmacy FEFO dispense — transactional stock integrity.
 */

import { EventEmitter2 } from '@nestjs/event-emitter';
import { DispenseMedicationUseCase } from '../use-cases/dispense-medication.usecase';

describe('DispenseMedicationUseCase', () => {
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  let prisma: any;
  let useCase: DispenseMedicationUseCase;

  beforeEach(() => {
    prisma = {
      isConnected: true,
      stockMovements: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      medications: { findMany: jest.fn().mockResolvedValue([]) },
      batches: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    useCase = new DispenseMedicationUseCase(prisma, events);
    jest.clearAllMocks();
  });

  it('decrements stock conditionally and records movement', async () => {
    prisma.batches.findMany.mockResolvedValue([
      {
        id: 'batch1',
        batch_number: 'B1',
        quantity_on_hand: 10,
        expiry_date: new Date('2027-01-01'),
      },
    ]);
    prisma.batches.updateMany.mockResolvedValue({ count: 1 });
    prisma.stockMovements.create.mockResolvedValue({});

    const result = await useCase.dispenseForVisit({
      visitId: 'v1',
      performedBy: 'u1',
      lines: [{ medicationId: 'm1', medication: 'Amox', quantity: 4 }],
    });

    expect(result.dispensed).toBe(4);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.batches.updateMany).toHaveBeenCalledWith({
      where: { id: 'batch1', quantity_on_hand: { gte: 4 } },
      data: { quantity_on_hand: { decrement: 4 } },
    });
    expect(prisma.stockMovements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movement_type: 'DISPENSE',
          quantity_change: -4,
          reference_type: null,
          notes: expect.stringContaining('visit:v1'),
        }),
      }),
    );
  });

  it('is idempotent when visit already dispensed', async () => {
    prisma.stockMovements.findFirst.mockResolvedValue({ id: 'sm1' });
    const result = await useCase.dispenseForVisit({
      visitId: 'v1',
      performedBy: 'u1',
      lines: [{ medicationId: 'm1', medication: 'Amox', quantity: 1 }],
    });
    expect(result.dispensed).toBe(0);
    expect(prisma.batches.updateMany).not.toHaveBeenCalled();
  });

  it('skips expired batches', async () => {
    prisma.batches.findMany.mockResolvedValue([]);
    const result = await useCase.dispenseForVisit({
      visitId: 'v3',
      performedBy: 'u1',
      lines: [{ medicationId: 'm1', medication: 'Amox', quantity: 1 }],
    });
    expect(result.dispensed).toBe(0);
    expect(result.warnings.some((w) => w.includes('non-expired'))).toBe(true);
    expect(prisma.batches.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiry_date: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });

  it('does not oversell when conditional update fails', async () => {
    prisma.batches.findMany.mockResolvedValue([
      {
        id: 'batch1',
        batch_number: 'B1',
        quantity_on_hand: 2,
        expiry_date: new Date('2027-01-01'),
      },
    ]);
    prisma.batches.updateMany.mockResolvedValue({ count: 0 });

    const result = await useCase.dispenseForVisit({
      visitId: 'v2',
      performedBy: 'u1',
      lines: [{ medicationId: 'm1', medication: 'Amox', quantity: 2 }],
    });

    expect(result.dispensed).toBe(0);
    expect(result.warnings.some((w) => w.includes('Concurrent'))).toBe(true);
  });

  describe('formal Rx sync — only fully-dispensed lines flip to DISPENSED', () => {
    beforeEach(() => {
      prisma.outpatientVisits = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v4',
          payload: { pharmacy: { prescriptionId: 'rx1' } },
        }),
        update: jest.fn().mockResolvedValue({}),
      };
      prisma.prescriptions = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rx1',
          is_voided: false,
          status: 'PENDING',
        }),
        update: jest.fn().mockResolvedValue({}),
      };
      prisma.prescriptionLines = {
        findMany: jest.fn().mockResolvedValue([
          { id: 'lineA', medication_id: 'm1' },
          { id: 'lineB', medication_id: 'm2' },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(1), // lineB still PENDING afterwards
      };
    });

    it('marks only the fully-stocked line DISPENSED and sets PARTIALLY_DISPENSED', async () => {
      // m1: fully stocked (10 on hand, 4 requested). m2: short (2 on hand, 5 requested).
      prisma.batches.findMany
        .mockResolvedValueOnce([
          {
            id: 'batch-m1',
            batch_number: 'B-M1',
            quantity_on_hand: 10,
            expiry_date: new Date('2027-01-01'),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'batch-m2',
            batch_number: 'B-M2',
            quantity_on_hand: 2,
            expiry_date: new Date('2027-01-01'),
          },
        ]);
      prisma.batches.updateMany.mockResolvedValue({ count: 1 });

      await useCase.dispenseForVisit({
        visitId: 'v4',
        performedBy: 'u1',
        lines: [
          { medicationId: 'm1', medication: 'Amoxicillin', quantity: 4 },
          { medicationId: 'm2', medication: 'Paracetamol', quantity: 5 },
        ],
      });

      expect(prisma.prescriptionLines.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['lineA'] } },
        }),
      );
      expect(prisma.prescriptions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'PARTIALLY_DISPENSED' },
        }),
      );
    });

    it('does not touch the formal Rx at all when nothing fully dispensed', async () => {
      prisma.batches.findMany.mockResolvedValue([]); // no usable stock at all
      await useCase.dispenseForVisit({
        visitId: 'v4',
        performedBy: 'u1',
        lines: [{ medicationId: 'm1', medication: 'Amoxicillin', quantity: 4 }],
      });
      expect(prisma.prescriptionLines.updateMany).not.toHaveBeenCalled();
      expect(prisma.prescriptions.update).not.toHaveBeenCalled();
    });
  });
});
