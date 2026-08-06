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
});
