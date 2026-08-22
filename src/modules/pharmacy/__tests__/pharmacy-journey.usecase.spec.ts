/**
 * Pharmacy journey unit tests — Rx dispense + PO receive.
 */

import { BadRequestException } from '@nestjs/common';
import { PharmacyJourneyUseCase } from '../use-cases/pharmacy-journey.usecase';

describe('PharmacyJourneyUseCase', () => {
  let prisma: any;
  let journey: PharmacyJourneyUseCase;

  beforeEach(() => {
    prisma = {
      patients: { findFirst: jest.fn() },
      staffProfiles: { findFirst: jest.fn() },
      medications: { findMany: jest.fn() },
      suppliers: { findFirst: jest.fn() },
      prescriptions: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      prescriptionLines: {
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      batches: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      stockMovements: { create: jest.fn() },
      purchaseOrders: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      purchaseOrderLines: {
        createMany: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    journey = new PharmacyJourneyUseCase(prisma, {
      recordMutation: jest.fn().mockResolvedValue(undefined),
    } as any, { emit: jest.fn() } as any);
    jest.clearAllMocks();
  });

  it('rejects dispense of voided prescription', async () => {
    prisma.prescriptions.findFirst.mockResolvedValue({
      id: 'rx1',
      is_voided: true,
      status: 'PENDING',
      pharmacy_prescription_lines_prescription_id: [],
    });
    await expect(
      journey.dispensePrescription({
        prescriptionId: 'rx1',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects insufficient stock on Rx dispense (full rollback)', async () => {
    prisma.prescriptions.findFirst.mockResolvedValue({
      id: 'rx1',
      is_voided: false,
      status: 'PENDING',
      prescription_number: 'RX-1',
      pharmacy_prescription_lines_prescription_id: [
        {
          id: 'l1',
          status: 'PENDING',
          quantity: 5,
          medication_id: 'm1',
          medication: { medication_name: 'Amox' },
        },
      ],
    });
    prisma.batches.findMany.mockResolvedValue([
      {
        id: 'b1',
        quantity_on_hand: 2,
        expiry_date: new Date('2027-01-01'),
      },
    ]);
    prisma.batches.updateMany.mockResolvedValue({ count: 1 });
    prisma.stockMovements.create.mockResolvedValue({});

    await expect(
      journey.dispensePrescription({
        prescriptionId: 'rx1',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('receives PO into batch with RECEIVE movement', async () => {
    prisma.purchaseOrders.findFirst
      .mockResolvedValueOnce({
        id: 'po1',
        order_number: 'PO-1',
        status: 'SENT',
        supplier_id: 's1',
        pharmacy_purchase_order_lines_purchase_order_id: [
          {
            id: 'pl1',
            medication_id: 'm1',
            quantity_ordered: 10,
            unit_cost: 5,
            received_quantity: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'po1',
        order_number: 'PO-1',
        status: 'RECEIVED',
        supplier_id: 's1',
        order_date: new Date(),
        expected_delivery_date: null,
        notes: null,
        created_by: 'u1',
        supplier: { company_name: 'Acme' },
        pharmacy_purchase_order_lines_purchase_order_id: [
          {
            id: 'pl1',
            medication_id: 'm1',
            quantity_ordered: 10,
            unit_cost: 5,
            received_quantity: 10,
            received_at: new Date(),
            medication: { medication_name: 'Amox' },
          },
        ],
      });
    prisma.batches.findFirst.mockResolvedValue(null);
    prisma.batches.create.mockResolvedValue({ id: 'b1' });
    prisma.stockMovements.create.mockResolvedValue({});
    prisma.purchaseOrderLines.update.mockResolvedValue({});
    prisma.purchaseOrderLines.findMany.mockResolvedValue([
      { received_quantity: 10, quantity_ordered: 10 },
    ]);
    prisma.purchaseOrders.update.mockResolvedValue({});

    const result = await journey.receivePurchaseOrder({
      purchaseOrderId: 'po1',
      performedBy: 'u1',
      receipts: [
        {
          lineId: 'pl1',
          quantity: 10,
          batchNumber: 'LOT-1',
          expiryDate: '2027-06-01',
        },
      ],
    });

    expect(result.status).toBe('RECEIVED');
    expect(prisma.stockMovements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movement_type: 'RECEIVE',
          reference_type: 'PURCHASE_ORDER',
        }),
      }),
    );
  });
});
