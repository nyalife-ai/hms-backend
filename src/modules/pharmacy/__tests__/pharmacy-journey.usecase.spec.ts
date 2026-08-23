/**
 * Pharmacy journey unit tests — Rx dispense + PO receive.
 */

import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PharmacyJourneyUseCase } from '../use-cases/pharmacy-journey.usecase';

const profile = (first = 'Jane', last = 'Doe') => [
  { first_name: first, last_name: last },
];

function rxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rx1',
    patient_id: 'p1',
    consultation_id: null,
    prescription_number: 'RX-1',
    prescribed_by: 'd1',
    prescription_date: new Date('2026-08-01'),
    status: 'PENDING',
    notes: null,
    is_voided: false,
    void_reason: null,
    voided_by: null,
    voided_at: null,
    deleted_at: null,
    patient: {
      patient_number: 'MRN1',
      user: { core_profiles_user_id: profile() },
    },
    rel_prescribed_by: {
      user: { core_profiles_user_id: profile('Doc', 'Tor') },
    },
    rel_voided_by: null,
    pharmacy_prescription_lines_prescription_id: [
      {
        id: 'l1',
        medication_id: 'm1',
        dosage: '1',
        frequency: 'OD',
        duration: '5d',
        quantity: 5,
        instructions: null,
        status: 'PENDING',
        dispensed_by: null,
        dispensed_at: null,
        medication: { medication_name: 'Amox' },
        rel_dispensed_by: null,
      },
    ],
    ...overrides,
  };
}

function poRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po1',
    order_number: 'PO-1',
    supplier_id: 's1',
    order_date: new Date('2026-08-01'),
    expected_delivery_date: null,
    status: 'DRAFT',
    notes: null,
    created_by: 'u1',
    supplier: { company_name: 'Acme' },
    rel_created_by: {
      core_profiles_user_id: profile('Buyer', 'One'),
    },
    pharmacy_purchase_order_lines_purchase_order_id: [
      {
        id: 'pl1',
        medication_id: 'm1',
        quantity_ordered: 10,
        unit_cost: 5,
        received_quantity: 0,
        received_at: null,
        medication: { medication_name: 'Amox' },
      },
    ],
    ...overrides,
  };
}

describe('PharmacyJourneyUseCase', () => {
  let prisma: any;
  let audit: { recordMutation: jest.Mock };
  let events: { emit: jest.Mock };
  let journey: PharmacyJourneyUseCase;

  beforeEach(() => {
    prisma = {
      patients: { findFirst: jest.fn() },
      staffProfiles: { findFirst: jest.fn() },
      medications: { findMany: jest.fn() },
      suppliers: { findFirst: jest.fn() },
      outpatientVisits: { findUnique: jest.fn() },
      prescriptions: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
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
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
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
    audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };
    journey = new PharmacyJourneyUseCase(prisma, audit as any, events as any);
    jest.clearAllMocks();
  });

  it('lists prescriptions with visit/appointment scope and search', async () => {
    prisma.outpatientVisits.findUnique.mockResolvedValue({
      payload: {
        appointmentId: 'appt1',
        pharmacy: { prescriptionId: 'rx1' },
      },
      patient_id: 'p1',
    });
    prisma.prescriptions.findMany.mockResolvedValue([rxRow()]);
    prisma.prescriptions.count.mockResolvedValue(1);
    const listed = await journey.listPrescriptions({
      visitId: 'v1',
      search: 'Jane',
      status: 'pending',
      from: new Date('2026-01-01'),
      to: new Date('2026-12-31'),
      patientId: 'p1',
    });
    expect(listed.items[0].id).toBe('rx1');

    prisma.outpatientVisits.findUnique.mockResolvedValue({
      payload: {},
      patient_id: 'p1',
    });
    await journey.listPrescriptions({ visitId: 'v2', consultationId: 'c1' });

    await journey.listPrescriptions({ appointmentId: 'appt-only' });

    prisma.outpatientVisits.findUnique.mockResolvedValue({
      payload: null,
      patient_id: 'p1',
    });
    await journey.listPrescriptions({ visitId: 'empty-scope' });
  });

  it('gets and creates prescriptions', async () => {
    prisma.prescriptions.findFirst.mockResolvedValue(null);
    await expect(journey.getPrescription('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.prescriptions.findFirst.mockResolvedValue(rxRow());
    expect((await journey.getPrescription('rx1')).mrn).toBe('MRN1');

    await expect(
      journey.createPrescription({
        patientId: 'p1',
        prescribedByStaffId: 'd1',
        lines: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      journey.createPrescription({
        patientId: 'p1',
        prescribedByStaffId: 'd1',
        lines: [
          {
            medicationId: 'm1',
            dosage: ' ',
            frequency: 'OD',
            duration: '5d',
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      journey.createPrescription({
        patientId: 'p1',
        prescribedByStaffId: 'd1',
        lines: [
          {
            medicationId: 'm1',
            dosage: '1',
            frequency: 'OD',
            duration: '5d',
            quantity: 0,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.patients.findFirst.mockResolvedValue(null);
    await expect(
      journey.createPrescription({
        patientId: 'p1',
        prescribedByStaffId: 'd1',
        lines: [
          {
            medicationId: 'm1',
            dosage: '1',
            frequency: 'OD',
            duration: '5d',
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.patients.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.staffProfiles.findFirst.mockResolvedValue(null);
    await expect(
      journey.createPrescription({
        patientId: 'p1',
        prescribedByStaffId: 'd1',
        lines: [
          {
            medicationId: 'm1',
            dosage: '1',
            frequency: 'OD',
            duration: '5d',
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'd1' });
    prisma.medications.findMany.mockResolvedValue([]);
    await expect(
      journey.createPrescription({
        patientId: 'p1',
        prescribedByStaffId: 'd1',
        lines: [
          {
            medicationId: 'm1',
            dosage: '1',
            frequency: 'OD',
            duration: '5d',
            quantity: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.medications.findMany.mockResolvedValue([{ id: 'm1' }]);
    prisma.prescriptions.create.mockResolvedValue({ id: 'rx1' });
    prisma.prescriptionLines.createMany.mockResolvedValue({ count: 1 });
    prisma.prescriptions.findFirst.mockResolvedValue(rxRow());
    const created = await journey.createPrescription({
      patientId: 'p1',
      prescribedByStaffId: 'd1',
      notes: 'ward',
      lines: [
        {
          medicationId: 'm1',
          dosage: '1',
          frequency: 'OD',
          duration: '5d',
          quantity: 5,
        },
      ],
      actorUserId: 'u1',
    });
    expect(created.id).toBe('rx1');
    expect(events.emit).toHaveBeenCalled();
  });

  it('cancels and voids prescriptions', async () => {
    prisma.prescriptions.findFirst.mockResolvedValue(null);
    await expect(
      journey.cancelPrescription('x', 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.prescriptions.findFirst.mockResolvedValue(
      rxRow({ is_voided: true }),
    );
    await expect(
      journey.cancelPrescription('rx1', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.prescriptions.findFirst.mockResolvedValue(
      rxRow({ status: 'DISPENSED' }),
    );
    await expect(
      journey.cancelPrescription('rx1', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.prescriptions.findFirst
      .mockResolvedValueOnce(rxRow())
      .mockResolvedValueOnce(rxRow({ status: 'CANCELLED' }));
    prisma.prescriptions.update.mockResolvedValue({});
    prisma.prescriptionLines.updateMany.mockResolvedValue({ count: 1 });
    const cancelled = await journey.cancelPrescription('rx1', 'u1', 'mistake');
    expect(cancelled.status).toBe('CANCELLED');

    await expect(
      journey.voidPrescription({
        prescriptionId: 'rx1',
        voidReason: '  ',
        voidedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.prescriptions.findFirst.mockResolvedValue(null);
    await expect(
      journey.voidPrescription({
        prescriptionId: 'rx1',
        voidReason: 'error',
        voidedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.prescriptions.findFirst.mockResolvedValue(
      rxRow({ is_voided: true }),
    );
    await expect(
      journey.voidPrescription({
        prescriptionId: 'rx1',
        voidReason: 'error',
        voidedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.prescriptions.findFirst
      .mockResolvedValueOnce(rxRow())
      .mockResolvedValueOnce(rxRow({ is_voided: true, status: 'CANCELLED' }));
    prisma.prescriptions.update.mockResolvedValue({});
    const voided = await journey.voidPrescription({
      prescriptionId: 'rx1',
      voidReason: 'fraud',
      voidedBy: 'u1',
    });
    expect(voided.isVoided).toBe(true);
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

  it('dispense error and success paths', async () => {
    prisma.prescriptions.findFirst.mockResolvedValue(null);
    await expect(
      journey.dispensePrescription({
        prescriptionId: 'rx1',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.prescriptions.findFirst.mockResolvedValue(
      rxRow({ status: 'CANCELLED' }),
    );
    await expect(
      journey.dispensePrescription({
        prescriptionId: 'rx1',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.prescriptions.findFirst.mockResolvedValue(
      rxRow({
        pharmacy_prescription_lines_prescription_id: [
          {
            id: 'l1',
            status: 'DISPENSED',
            quantity: 5,
            medication_id: 'm1',
            medication: { medication_name: 'Amox' },
          },
        ],
      }),
    );
    await expect(
      journey.dispensePrescription({
        prescriptionId: 'rx1',
        performedBy: 'u1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.prescriptions.findFirst
      .mockResolvedValueOnce(rxRow())
      .mockResolvedValueOnce(rxRow({ status: 'DISPENSED' }));
    prisma.batches.findMany.mockResolvedValue([
      { id: 'b1', quantity_on_hand: 10, expiry_date: new Date('2027-01-01') },
    ]);
    prisma.batches.updateMany.mockResolvedValue({ count: 1 });
    prisma.stockMovements.create.mockResolvedValue({});
    prisma.prescriptionLines.update.mockResolvedValue({});
    prisma.prescriptionLines.count.mockResolvedValue(0);
    prisma.prescriptions.update.mockResolvedValue({});
    const dispensed = await journey.dispensePrescription({
      prescriptionId: 'rx1',
      performedBy: 'u1',
      lineIds: ['l1'],
    });
    expect(dispensed.status).toBe('DISPENSED');

    prisma.prescriptions.findFirst.mockResolvedValue(rxRow());
    prisma.batches.findMany.mockResolvedValue([
      { id: 'b1', quantity_on_hand: 10, expiry_date: new Date('2027-01-01') },
    ]);
    prisma.batches.updateMany.mockResolvedValue({ count: 0 });
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

  it('purchase orders list/get/create/send/cancel', async () => {
    prisma.purchaseOrders.findMany.mockResolvedValue([poRow()]);
    prisma.purchaseOrders.count.mockResolvedValue(1);
    const listed = await journey.listPurchaseOrders({
      supplierId: 's1',
      status: 'draft',
      search: 'PO',
    });
    expect(listed.items[0].orderNumber).toBe('PO-1');

    prisma.purchaseOrders.findFirst.mockResolvedValue(null);
    await expect(journey.getPurchaseOrder('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.purchaseOrders.findFirst.mockResolvedValue(poRow());
    expect((await journey.getPurchaseOrder('po1')).supplierName).toBe('Acme');

    await expect(
      journey.createPurchaseOrder({
        supplierId: 's1',
        createdBy: 'u1',
        lines: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      journey.createPurchaseOrder({
        supplierId: 's1',
        createdBy: 'u1',
        lines: [{ medicationId: 'm1', quantityOrdered: 0, unitCost: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      journey.createPurchaseOrder({
        supplierId: 's1',
        createdBy: 'u1',
        lines: [{ medicationId: 'm1', quantityOrdered: 1, unitCost: -1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.suppliers.findFirst.mockResolvedValue(null);
    await expect(
      journey.createPurchaseOrder({
        supplierId: 's1',
        createdBy: 'u1',
        lines: [{ medicationId: 'm1', quantityOrdered: 1, unitCost: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.suppliers.findFirst.mockResolvedValue({ id: 's1', is_active: true });
    prisma.purchaseOrders.create.mockResolvedValue({ id: 'po1' });
    prisma.purchaseOrderLines.createMany.mockResolvedValue({ count: 1 });
    prisma.purchaseOrders.findFirst.mockResolvedValue(poRow());
    const created = await journey.createPurchaseOrder({
      supplierId: 's1',
      createdBy: 'u1',
      expectedDeliveryDate: '2026-09-01',
      notes: 'urgent',
      lines: [{ medicationId: 'm1', quantityOrdered: 10, unitCost: 5 }],
    });
    expect(created.id).toBe('po1');

    prisma.purchaseOrders.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(poRow({ status: 'SENT' }))
      .mockResolvedValueOnce(poRow())
      .mockResolvedValueOnce(poRow({ status: 'SENT' }));
    await expect(journey.sendPurchaseOrder('x', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      journey.sendPurchaseOrder('po1', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.purchaseOrders.update.mockResolvedValue({});
    expect((await journey.sendPurchaseOrder('po1', 'u1')).status).toBe('SENT');

    prisma.purchaseOrders.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(poRow({ status: 'RECEIVED' }))
      .mockResolvedValueOnce(poRow({ status: 'SENT' }))
      .mockResolvedValueOnce(poRow({ status: 'CANCELLED' }));
    await expect(
      journey.cancelPurchaseOrder('x', 'u1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      journey.cancelPurchaseOrder('po1', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      (await journey.cancelPurchaseOrder('po1', 'u1')).status,
    ).toBe('CANCELLED');
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

  it('receivePurchaseOrder validation and existing batch path', async () => {
    await expect(
      journey.receivePurchaseOrder({
        purchaseOrderId: 'po1',
        performedBy: 'u1',
        receipts: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.purchaseOrders.findFirst.mockResolvedValue(null);
    await expect(
      journey.receivePurchaseOrder({
        purchaseOrderId: 'po1',
        performedBy: 'u1',
        receipts: [
          {
            lineId: 'pl1',
            quantity: 1,
            batchNumber: 'L',
            expiryDate: '2027-01-01',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.purchaseOrders.findFirst.mockResolvedValue(
      poRow({ status: 'CANCELLED' }),
    );
    await expect(
      journey.receivePurchaseOrder({
        purchaseOrderId: 'po1',
        performedBy: 'u1',
        receipts: [
          {
            lineId: 'pl1',
            quantity: 1,
            batchNumber: 'L',
            expiryDate: '2027-01-01',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.purchaseOrders.findFirst.mockResolvedValue(poRow({ status: 'SENT' }));
    await expect(
      journey.receivePurchaseOrder({
        purchaseOrderId: 'po1',
        performedBy: 'u1',
        receipts: [
          {
            lineId: 'pl1',
            quantity: 0,
            batchNumber: 'L',
            expiryDate: '2027-01-01',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      journey.receivePurchaseOrder({
        purchaseOrderId: 'po1',
        performedBy: 'u1',
        receipts: [
          {
            lineId: 'unknown',
            quantity: 1,
            batchNumber: 'L',
            expiryDate: '2027-01-01',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      journey.receivePurchaseOrder({
        purchaseOrderId: 'po1',
        performedBy: 'u1',
        receipts: [
          {
            lineId: 'pl1',
            quantity: 99,
            batchNumber: 'L',
            expiryDate: '2027-01-01',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.purchaseOrders.findFirst
      .mockResolvedValueOnce(poRow({ status: 'DRAFT' }))
      .mockResolvedValueOnce(poRow({ status: 'SENT' }));
    prisma.batches.findFirst.mockResolvedValue({ id: 'b1' });
    prisma.batches.update.mockResolvedValue({});
    prisma.stockMovements.create.mockResolvedValue({});
    prisma.purchaseOrderLines.update.mockResolvedValue({});
    prisma.purchaseOrderLines.findMany.mockResolvedValue([
      { received_quantity: 5, quantity_ordered: 10 },
    ]);
    prisma.purchaseOrders.update.mockResolvedValue({});
    const partial = await journey.receivePurchaseOrder({
      purchaseOrderId: 'po1',
      performedBy: 'u1',
      receipts: [
        {
          lineId: 'pl1',
          quantity: 5,
          batchNumber: 'LOT-1',
          expiryDate: '2027-06-01',
          manufacturingDate: '2026-01-01',
        },
      ],
    });
    expect(partial.status).toBe('SENT');
    expect(prisma.batches.update).toHaveBeenCalled();
  });
});
