/**
 * VisitsService — catalogue, queue filters, and fee/waiver paths with mocks.
 */

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VisitsService } from '../visits.service';
import { SYMPTOM_CATALOGUE } from '../symptom-catalogue';
import type { VisitRow } from '../repositories/visits.repository.interface';

function row(overrides: Partial<VisitRow> & { payload?: Record<string, unknown> } = {}): VisitRow {
  const { payload, ...rest } = overrides;
  return {
    id: 'v1',
    patient_id: 'pat1',
    patient_name: 'Ann Bee',
    mrn: 'MRN-1',
    age: 30,
    gender: 'Female',
    phone: '0700',
    first_visit: true,
    stage: 'CHECKED_IN',
    checked_in_at: new Date('2026-08-01T08:00:00.000Z'),
    reason_for_visit: 'Fever',
    additional_notes: null,
    payload: {
      payment: { method: 'CASH' },
      doctorStaffId: 'staff-doc',
      doctorName: 'Dr Kim',
      triagePriority: 'URGENT',
      triageCompletedAt: '2026-08-01T08:10:00.000Z',
      ...payload,
    },
    ...rest,
  };
}

describe('VisitsService', () => {
  const prisma = {
    isConnected: true,
    settings: { findUnique: jest.fn().mockResolvedValue(null) },
    appointments: { update: jest.fn().mockResolvedValue({}) },
    consultations: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'cons1' }),
      update: jest.fn().mockResolvedValue({ id: 'cons1' }),
    },
    staffProfiles: {
      findFirst: jest.fn().mockResolvedValue({ id: 'staff-doc', user_id: 'u-doc' }),
    },
    testTypes: { findMany: jest.fn().mockResolvedValue([]) },
    invoiceItems: { findMany: jest.fn().mockResolvedValue([]) },
    patients: {
      findUnique: jest.fn().mockResolvedValue({ id: 'pat1', patient_number: 'MRN-1' }),
    },
    receipts: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'rcp1', receipt_number: 'RCP-1' }),
    },
    vitalSigns: {
      create: jest.fn().mockResolvedValue({ id: 'vs-new' }),
    },
  };
  const visits = {
    findAllOrdered: jest.fn().mockResolvedValue([]),
    findByAppointmentId: jest.fn(),
    findById: jest.fn(),
    count: jest.fn().mockResolvedValue(1),
    update: jest.fn(),
    create: jest.fn(),
    findAppointment: jest.fn(),
    markAppointmentArrived: jest.fn(),
    findPatientIdByMrn: jest.fn().mockResolvedValue('pat1'),
    upsertLabRequest: jest.fn().mockResolvedValue({ id: 'lab-req-1' }),
    findAdminUserId: jest.fn().mockResolvedValue('admin-u'),
  };
  const billing = {
    ensureFeeSchedule: jest.fn().mockResolvedValue(undefined),
    createConsultFeeDraft: jest.fn().mockResolvedValue({
      invoiceId: 'inv1',
      invoiceNumber: 'INV-1',
      totalAmount: '2500',
    }),
    collectOnInvoice: jest.fn().mockResolvedValue({
      invoiceId: 'inv1',
      invoiceNumber: 'INV-1',
      totalAmount: '2500',
    }),
    getFeeSchedule: jest.fn().mockResolvedValue({
      consult: 2500,
      lab: 1500,
      medication: 800,
    }),
    priceVisitBillLines: jest.fn().mockResolvedValue([]),
    settleVisit: jest.fn().mockResolvedValue({
      invoiceId: 'inv2',
      invoiceNumber: 'INV-2',
      paymentId: 'pay1',
      totalAmount: '3700',
    }),
    syncClaimStatus: jest.fn().mockResolvedValue(undefined),
  };
  const dispense = {
    dispenseForVisit: jest.fn().mockResolvedValue(undefined),
  };
  const pharmacyJourney = {
    createPrescription: jest.fn().mockResolvedValue({
      id: 'rx1',
      prescriptionNumber: 'RX-1',
    }),
  };
  const followUps = {
    ensureFromConsultation: jest.fn().mockResolvedValue({ id: 'fu1' }),
  };
  const events = { emit: jest.fn() };

  let service: VisitsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.isConnected = true;
    prisma.settings.findUnique.mockResolvedValue(null);
    service = new VisitsService(
      prisma as never,
      visits as never,
      billing as never,
      dispense as never,
      pharmacyJourney as never,
      followUps as never,
      events as unknown as EventEmitter2,
    );
  });

  it('listSymptomCatalogue returns static triage catalogues', () => {
    const res = service.listSymptomCatalogue();
    expect(res.symptoms).toBe(SYMPTOM_CATALOGUE);
    expect(res.reasonOptions.length).toBeGreaterThan(0);
    expect(res.conditions.length).toBeGreaterThan(0);
    expect(res.redFlags.length).toBeGreaterThan(0);
  });

  it('findAll requires a connected database', async () => {
    prisma.isConnected = false;
    await expect(service.findAll()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('findAll filters by appointment and doctor assignment, then sorts queue', async () => {
    const emergency = row({
      id: 've',
      stage: 'CHECKED_IN',
      payload: {
        triagePriority: 'EMERGENCY',
        triageCompletedAt: '2026-08-01T09:00:00.000Z',
        doctorStaffId: 'staff-doc',
      },
    });
    const urgent = row({
      id: 'vu',
      stage: 'CHECKED_IN',
      checked_in_at: new Date('2026-08-01T07:00:00.000Z'),
      payload: {
        triagePriority: 'URGENT',
        triageCompletedAt: '2026-08-01T07:30:00.000Z',
        doctorStaffId: 'staff-doc',
      },
    });
    const otherDoc = row({
      id: 'vo',
      payload: { doctorStaffId: 'other', triagePriority: 'NORMAL' },
    });
    const done = row({
      id: 'vd',
      stage: 'COMPLETED',
      checked_in_at: new Date('2026-08-01T06:00:00.000Z'),
      payload: { doctorStaffId: 'staff-doc' },
    });
    visits.findAllOrdered.mockResolvedValue([urgent, emergency, otherDoc, done]);
    visits.findByAppointmentId.mockResolvedValue(null);

    const doctor = {
      role: 'DOCTOR',
      staffProfileId: 'staff-doc',
      name: 'Dr Kim',
    } as never;

    const queue = await service.findAll(doctor);
    expect(queue.map((v) => v.id)).toEqual(['ve', 'vu', 'vd']);
  });

  it('findOne enforces doctor assignment', async () => {
    visits.findById.mockResolvedValue(row());
    await expect(
      service.findOne('v1', {
        role: 'DOCTOR',
        staffProfileId: 'someone-else',
        name: 'Other',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(service.findOne('v1')).resolves.toEqual(
      expect.objectContaining({ id: 'v1', patientName: 'Ann Bee' }),
    );

    visits.findById.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('waives consult fee only before doctor and when unpaid', async () => {
    const awaiting = row({
      stage: 'AWAITING_PAYMENT',
      payload: {
        billing: {
          total: 2500,
          mode: 'CASH',
          consultFeeStatus: 'PENDING',
          invoiceId: 'inv1',
        },
      },
    });
    visits.findById.mockResolvedValue(awaiting);
    visits.update.mockImplementation(async (_id, data) =>
      row({
        stage: data.stage,
        payload: data.payload as Record<string, unknown>,
      }),
    );

    const waived = await service.waiveConsultFee('v1');
    expect(waived.stage).toBe('CHECKED_IN');
    expect(waived.billing?.consultFeeStatus).toBe('WAIVED');

    visits.findById.mockResolvedValue(
      row({
        stage: 'IN_CONSULTATION',
        payload: { billing: { consultFeeStatus: 'PENDING' } },
      }),
    );
    await expect(service.waiveConsultFee('v1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    visits.findById.mockResolvedValue(
      row({
        stage: 'AWAITING_PAYMENT',
        payload: { billing: { consultFeeStatus: 'PAID' } },
      }),
    );
    await expect(service.waiveConsultFee('v1')).rejects.toThrow(/already paid/);
  });

  it('collects consult fee via billing settlement and returns to triage', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'AWAITING_PAYMENT',
        payload: {
          billing: {
            total: 2500,
            mode: 'CASH',
            invoiceId: 'inv1',
            invoiceNumber: 'INV-1',
            consultFeeStatus: 'PENDING',
          },
        },
      }),
    );
    visits.update.mockImplementation(async (_id, data) =>
      row({
        stage: data.stage,
        payload: data.payload as Record<string, unknown>,
      }),
    );

    const paid = await service.collectConsultFee('v1', 'u1', 'CASH');
    expect(billing.collectOnInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv1', mode: 'CASH', actorUserId: 'u1' }),
    );
    expect(paid.stage).toBe('CHECKED_IN');
    expect(paid.billing?.consultFeeStatus).toBe('PAID');
  });

  it('onModuleInit ensures fee schedule when DB is connected', async () => {
    await service.onModuleInit();
    expect(billing.ensureFeeSchedule).toHaveBeenCalled();
  });

  it('onModuleInit seeds memory visits when the queue is empty', async () => {
    visits.count.mockResolvedValueOnce(0);
    visits.create.mockImplementation(async (data) =>
      row({
        id: data.id ?? 'seeded',
        patient_name: data.patientName,
        mrn: data.mrn,
        stage: data.stage,
        checked_in_at: data.checkedInAt,
        payload: data.payload as Record<string, unknown>,
      }),
    );
    await service.onModuleInit();
    expect(visits.create).toHaveBeenCalled();
  });

  function patchUpdateFromRow() {
    visits.update.mockImplementation(async (id, data) =>
      row({
        id,
        stage: data.stage,
        reason_for_visit: data.reasonForVisit ?? null,
        additional_notes: data.additionalNotes ?? null,
        payload: data.payload as Record<string, unknown>,
      }),
    );
  }

  const triageBody = {
    reasonForVisit: 'Fever',
    chiefComplaint: 'High fever for 2 days',
    nurseName: 'Nurse Joy',
    doctorName: 'Dr Kim',
    doctorStaffId: 'staff-doc',
    priority: 'NORMAL' as const,
    vitals: {
      temperature: '37.5',
      systolic: '120',
      diastolic: '80',
      pulse: '72',
      respRate: '16',
      spo2: '98',
      weightKg: '70',
      heightCm: '170',
    },
  };

  it('updates reception notes and records triage into waiting doctor', async () => {
    visits.findById.mockResolvedValue(row());
    patchUpdateFromRow();

    const reception = await service.updateReception('v1', {
      reasonForVisit: 'Cough',
      additionalNotes: 'Walk-in',
    });
    expect(reception.reasonForVisit).toBe('Cough');

    visits.findById.mockResolvedValue(row({ stage: 'CHECKED_IN' }));
    const triaged = await service.recordTriage('v1', triageBody, {
      id: 'nurse-1',
      role: 'NURSE',
      name: 'Nurse Joy',
    } as never);
    expect(triaged.stage).toBe('WAITING_DOCTOR');
    expect(triaged.triagePriority).toBe('NORMAL');
    expect(triaged.vitals?.bmi).toBeTruthy();
    expect(prisma.vitalSigns.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patient_id: 'pat1',
          blood_pressure: '120/80',
          recorded_by: 'nurse-1',
        }),
      }),
    );
  });

  it('rejects triage when payment is pending or vitals are impossible', async () => {
    visits.findById.mockResolvedValue(
      row({ stage: 'AWAITING_PAYMENT' }),
    );
    await expect(
      service.recordTriage('v1', triageBody),
    ).rejects.toBeInstanceOf(BadRequestException);

    visits.findById.mockResolvedValue(row({ stage: 'CHECKED_IN' }));
    await expect(
      service.recordTriage('v1', {
        ...triageBody,
        priority: 'URGENT',
        priorityReason: undefined,
      }),
    ).rejects.toThrow(/priorityReason/);

    await expect(
      service.recordTriage('v1', {
        ...triageBody,
        vitals: { ...triageBody.vitals, temperature: '99' },
      }),
    ).rejects.toThrow(/temperature/);
  });

  it('checks in patients and optionally charges consult fee', async () => {
    visits.create.mockImplementation(async (data) =>
      row({
        id: data.id ?? 'v-new',
        patient_name: data.patientName,
        mrn: data.mrn,
        stage: data.stage,
        checked_in_at: data.checkedInAt,
        payload: data.payload as Record<string, unknown>,
      }),
    );
    visits.findById.mockImplementation(async (id) =>
      row({
        id,
        stage: 'CHECKED_IN',
        payload: { payment: { method: 'CASH' } },
      }),
    );
    patchUpdateFromRow();

    const created = await service.checkIn(
      {
        patientName: 'Ann Bee',
        mrn: 'MRN-1',
        age: 30,
        gender: 'Female',
        phone: '0700',
        firstVisit: true,
        payment: { method: 'CASH' },
        reasonForVisit: 'Fever',
      },
      'u1',
    );
    expect(billing.createConsultFeeDraft).toHaveBeenCalled();
    expect(created.stage).toBe('AWAITING_PAYMENT');
  });

  it('skips consult fee for insurance check-ins and marks appointments arrived', async () => {
    visits.findAppointment.mockResolvedValue({
      id: 'appt1',
      status: 'SCHEDULED',
      doctorId: 'staff-doc',
    });
    visits.create.mockImplementation(async (data) =>
      row({
        id: data.id ?? 'v-ins',
        stage: data.stage,
        checked_in_at: data.checkedInAt,
        payload: data.payload as Record<string, unknown>,
      }),
    );

    const visit = await service.checkIn(
      {
        patientName: 'Ann Bee',
        mrn: 'MRN-1',
        age: 30,
        gender: 'Female',
        phone: '0700',
        firstVisit: false,
        payment: { method: 'INSURANCE', provider: 'SHA', policyNumber: 'P1' },
        appointmentId: 'appt1',
        reasonForVisit: 'Review',
        additionalNotes: 'Bring card',
      },
      'u1',
    );
    expect(visits.markAppointmentArrived).toHaveBeenCalledWith('appt1');
    expect(prisma.appointments.update).toHaveBeenCalled();
    expect(billing.createConsultFeeDraft).not.toHaveBeenCalled();
    expect(visit.stage).toBe('CHECKED_IN');
  });

  it('charges consult fee at front desk and returns pending invoice visits', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'CHECKED_IN',
        payload: { payment: { method: 'CASH' } },
      }),
    );
    patchUpdateFromRow();
    const charged = await service.chargeConsultFee('v1', 'u1');
    expect(billing.createConsultFeeDraft).toHaveBeenCalled();
    expect(charged.stage).toBe('AWAITING_PAYMENT');

    visits.findById.mockResolvedValue(
      row({
        stage: 'CHECKED_IN',
        payload: {
          payment: { method: 'CASH' },
          billing: {
            consultFeeStatus: 'PENDING',
            invoiceId: 'inv1',
            total: 2500,
            mode: 'CASH',
          },
        },
      }),
    );
    const again = await service.chargeConsultFee('v1', 'u1');
    expect(again.stage).toBe('AWAITING_PAYMENT');
  });

  it('returns triage summary and starts consultation', async () => {
    visits.findById.mockResolvedValue(
      row({
        payload: {
          triage: {
            reasonForVisit: 'Fever',
            chiefComplaint: 'Fever',
            priority: 'URGENT',
            completedAt: '2026-08-01T08:10:00.000Z',
          },
          vitals: {
            temperature: '38',
            systolic: '120',
            diastolic: '80',
            pulse: '90',
            respRate: '18',
            spo2: '97',
            weightKg: '70',
          },
          triagePriority: 'URGENT',
        },
      }),
    );
    const summary = await service.getTriageSummary('v1');
    expect(summary.triagePriority).toBe('URGENT');
    expect(summary.patientName).toBe('Ann Bee');

    patchUpdateFromRow();
    visits.findById.mockResolvedValue(row({ stage: 'WAITING_DOCTOR' }));
    const started = await service.startConsultation('v1');
    expect(started.stage).toBe('IN_CONSULTATION');
  });

  it('saves clinical notes/orders and orders labs', async () => {
    visits.findById.mockResolvedValue(row({ stage: 'IN_CONSULTATION' }));
    patchUpdateFromRow();
    visits.upsertLabRequest.mockResolvedValue({ id: 'lab-req-1' });

    const notes = await service.saveClinicalRecord('v1', {
      chiefComplaint: 'Fever',
      impression: 'Viral illness',
    } as never);
    expect(notes.diagnosis).toBe('Viral illness');

    const orders = await service.saveClinicalOrders('v1', {
      orderedServices: [
        { id: 'svc-x', name: 'XRay', code: 'XR', unitPrice: '1000' },
      ],
    });
    expect(orders.orderedServices?.[0].id).toBe('svc-x');

    const labbed = await service.orderLabs(
      'v1',
      [{ name: 'CBC', unit: 'count', range: '—' }],
      'Fasting',
      'u1',
    );
    expect(labbed.stage).toBe('LAB_PENDING');
    expect(visits.upsertLabRequest).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalled();
  });

  it('submits lab results and completes consultation', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'LAB_PENDING',
        payload: {
          payment: { method: 'CASH' },
          labOrder: { tests: [{ name: 'CBC' }], notes: 'n' },
          doctorStaffId: 'staff-doc',
        },
      }),
    );
    patchUpdateFromRow();
    const results = await service.submitLabResults(
      'v1',
      [{ name: 'CBC', result: 'Normal' } as never],
      'OK',
      'u1',
    );
    expect(results.stage).toBe('RESULTS_READY');
    expect(events.emit).toHaveBeenCalled();

    visits.findById.mockResolvedValue(
      row({
        stage: 'IN_CONSULTATION',
        payload: { payment: { method: 'CASH' }, doctorName: 'Dr Kim' },
      }),
    );
    const done = await service.completeConsultation(
      'v1',
      {
        diagnosis: 'URI',
        prescriptions: [],
      },
      'u1',
    );
    expect(done.stage).toBe('READY_FOR_BILLING');
    expect(done.diagnosis).toBe('URI');
  });

  it('finalizes cash billing with nothing left after consult fee', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'READY_FOR_BILLING',
        payload: {
          payment: { method: 'CASH' },
          billing: {
            total: 2500,
            mode: 'CASH',
            consultFeeStatus: 'PAID',
            consultFeeAmount: 2500,
            invoiceId: 'inv1',
          },
        },
      }),
    );
    patchUpdateFromRow();
    billing.priceVisitBillLines.mockResolvedValueOnce([]);

    const completed = await service.finalizeBilling('v1', 0, 'u1');
    expect(completed.stage).toBe('COMPLETED');
    expect(billing.settleVisit).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalled();
  });

  it('finalizes cash billing via settleVisit when lines remain', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'READY_FOR_BILLING',
        payload: {
          payment: { method: 'CASH' },
          diagnosis: 'URI',
          labOrder: { tests: [{ name: 'CBC' }] },
          billing: { consultFeeStatus: 'PAID', consultFeeAmount: 2500 },
        },
      }),
    );
    patchUpdateFromRow();
    billing.priceVisitBillLines.mockResolvedValueOnce([
      { description: 'Lab: CBC', amount: 1200 },
    ]);
    prisma.invoiceItems.findMany.mockResolvedValueOnce([
      { description: 'Lab: CBC', total_price: 1200 },
    ]);

    const completed = await service.finalizeBilling('v1', 9999, 'u1');
    expect(billing.settleVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'CASH',
        lines: [{ description: 'Lab: CBC', amount: 1200 }],
      }),
    );
    expect(completed.stage).toBe('COMPLETED');
    expect(completed.billing?.invoiceId).toBe('inv2');
  });

  it('holds insurance visits at claim submitted when claim id is provided', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'READY_FOR_BILLING',
        payload: {
          payment: {
            method: 'INSURANCE',
            provider: 'SHA',
            policyNumber: 'P1',
          },
        },
      }),
    );
    patchUpdateFromRow();
    billing.priceVisitBillLines.mockResolvedValueOnce([
      { description: 'Consultation', amount: 2500 },
    ]);

    const held = await service.finalizeBilling('v1', 2500, 'u1', 'CL-EXT');
    expect(held.stage).toBe('CLAIM_SUBMITTED');
    expect(held.billing?.claimStatus).toBe('SUBMITTED');
  });

  it('updates claim status to accepted and signs off completed visits', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'CLAIM_SUBMITTED',
        payload: {
          payment: { method: 'INSURANCE', provider: 'SHA', policyNumber: 'P1' },
          billing: {
            total: 2500,
            mode: 'CLAIM',
            claimId: 'CL-1',
            claimStatus: 'SUBMITTED',
          },
        },
      }),
    );
    patchUpdateFromRow();

    const accepted = await service.updateClaimStatus('v1', 'ACCEPTED', 'u1');
    expect(billing.syncClaimStatus).toHaveBeenCalledWith('CL-1', 'ACCEPTED');
    expect(accepted.stage).toBe('COMPLETED');
    expect(accepted.billing?.claimStatus).toBe('ACCEPTED');

    visits.findById.mockResolvedValue(
      row({
        stage: 'CLAIM_SUBMITTED',
        payload: {
          payment: { method: 'INSURANCE', provider: 'SHA', policyNumber: 'P1' },
          billing: {
            total: 2500,
            mode: 'CLAIM',
            claimId: 'CL-1',
            claimStatus: 'ACCEPTED',
          },
        },
      }),
    );
    const signed = await service.signOff('v1');
    expect(signed.stage).toBe('COMPLETED');
  });

  it('rejects sign-off when insurer has not accepted', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'CLAIM_SUBMITTED',
        payload: {
          payment: { method: 'INSURANCE', provider: 'SHA', policyNumber: 'P1' },
          billing: {
            total: 2500,
            mode: 'CLAIM',
            claimId: 'CL-1',
            claimStatus: 'SUBMITTED',
          },
        },
      }),
    );
    await expect(service.signOff('v1')).rejects.toThrow(/not accepted/);
  });

  it('honors consultation_fee_enabled setting', async () => {
    expect(await service.isConsultationFeeEnabled()).toBe(true);
    prisma.settings.findUnique.mockResolvedValueOnce({
      key: 'consultation_fee_enabled',
      value: 'false',
    });
    expect(await service.isConsultationFeeEnabled()).toBe(false);
  });

  it('completes consultation with Rx, clinical mirror, and follow-up', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'IN_CONSULTATION',
        payload: {
          payment: { method: 'CASH' },
          doctorName: 'Dr Kim',
          appointmentId: 'appt-1',
        },
      }),
    );
    patchUpdateFromRow();
    visits.findPatientIdByMrn.mockResolvedValue('pat1');
    prisma.staffProfiles.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'staff-doc' })
      .mockResolvedValue({ id: 'staff-doc' });
    prisma.consultations.findFirst.mockResolvedValue(null);
    prisma.consultations.create.mockResolvedValue({ id: 'cons-new' });

    const done = await service.completeConsultation(
      'v1',
      {
        diagnosis: 'URI',
        prescriptions: [
          {
            medication: 'Amoxicillin',
            medicationId: 'med-1',
            dosage: '1 tab',
            frequency: 'BD',
            duration: '5 days',
            quantity: 10,
          },
        ],
        followUpDate: '2026-09-01',
        clinicalRecord: {
          chiefComplaint: 'Cough',
          impression: 'URI',
          generalExamination: 'Well',
          followUpInstructions: 'Return if worse',
        },
      } as never,
      'u1',
    );

    expect(done.stage).toBe('READY_FOR_BILLING');
    expect(pharmacyJourney.createPrescription).toHaveBeenCalled();
    expect(followUps.ensureFromConsultation).toHaveBeenCalled();
    expect(prisma.consultations.create).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      'visit.ready_for_billing',
      expect.objectContaining({
        payload: expect.objectContaining({ visitId: 'v1' }),
      }),
    );
  });

  it('tolerates pharmacy/follow-up failures during completeConsultation', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'IN_CONSULTATION',
        payload: { payment: { method: 'CASH' }, doctorName: 'Dr Kim' },
      }),
    );
    patchUpdateFromRow();
    visits.findPatientIdByMrn.mockResolvedValue('pat1');
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'staff-doc' });
    pharmacyJourney.createPrescription.mockRejectedValueOnce(new Error('rx down'));
    followUps.ensureFromConsultation.mockRejectedValueOnce(new Error('fu down'));

    const done = await service.completeConsultation(
      'v1',
      {
        diagnosis: 'URI',
        prescriptions: [
          { medication: 'Amox', medicationId: 'med-1', quantity: 1 },
        ],
        followUpDate: '2026-09-01',
      } as never,
      'u1',
    );
    expect(done.stage).toBe('READY_FOR_BILLING');
  });

  it('emits claim denied/submitted domain events from updateClaimStatus', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'CLAIM_SUBMITTED',
        payload: {
          payment: { method: 'INSURANCE', provider: 'SHA', policyNumber: 'P1' },
          billing: {
            total: 2500,
            mode: 'CLAIM',
            claimId: 'CL-1',
            claimStatus: 'SUBMITTED',
          },
        },
      }),
    );
    patchUpdateFromRow();

    await service.updateClaimStatus('v1', 'REJECTED', 'u1');
    expect(events.emit).toHaveBeenCalledWith(
      'insurance_claim.denied',
      expect.objectContaining({
        payload: expect.objectContaining({ claimId: 'CL-1' }),
      }),
    );

    await service.updateClaimStatus('v1', 'SUBMITTED', 'u1');
    expect(events.emit).toHaveBeenCalledWith(
      'insurance_claim.submitted',
      expect.objectContaining({
        payload: expect.objectContaining({ claimId: 'CL-1' }),
      }),
    );
  });

  it('filters findAll by appointmentId and allows admin to see all doctors', async () => {
    const match = row({ id: 'va', payload: { appointmentId: 'appt-9' } });
    visits.findAllOrdered.mockResolvedValue([]);
    visits.findByAppointmentId.mockResolvedValue(match);
    const byAppt = await service.findAll(undefined, 'appt-9');
    expect(byAppt[0].id).toBe('va');

    visits.findAllOrdered.mockResolvedValue([
      row({ id: 'v-a', payload: { doctorStaffId: 'a' } }),
      row({ id: 'v-b', payload: { doctorStaffId: 'b' } }),
    ]);
    const adminQueue = await service.findAll({
      role: 'ADMIN',
      staffProfileId: null,
    } as never);
    expect(adminQueue.map((v) => v.id)).toEqual(['v-a', 'v-b']);
  });

  it('updates existing consultation row when completing with appointmentId', async () => {
    visits.findById.mockResolvedValue(
      row({
        stage: 'IN_CONSULTATION',
        payload: {
          payment: { method: 'CASH' },
          doctorName: 'Dr Kim',
          appointmentId: 'appt-1',
        },
      }),
    );
    patchUpdateFromRow();
    visits.findPatientIdByMrn.mockResolvedValue('pat1');
    prisma.staffProfiles.findFirst.mockResolvedValue({ id: 'staff-doc' });
    prisma.consultations.findFirst.mockResolvedValue({ id: 'cons-existing' });

    await service.completeConsultation(
      'v1',
      {
        diagnosis: 'URI',
        clinicalRecord: { chiefComplaint: 'Pain', impression: 'URI' },
      } as never,
      'u1',
    );
    expect(prisma.consultations.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cons-existing' } }),
    );
  });

  it('matches doctors by display name when staff id is absent', async () => {
    visits.findById.mockResolvedValue(
      row({
        payload: {
          doctorStaffId: undefined,
          doctorName: 'Dr Kim',
        },
      }),
    );
    await expect(
      service.findOne('v1', {
        role: 'DOCTOR',
        staffProfileId: 'other',
        name: 'Dr Kim',
      } as never),
    ).resolves.toEqual(expect.objectContaining({ id: 'v1' }));
  });

  it('rejects triage missing chief complaint / reason and more vitals ranges', async () => {
    visits.findById.mockResolvedValue(row({ stage: 'CHECKED_IN' }));
    await expect(
      service.recordTriage('v1', {
        ...triageBody,
        reasonForVisit: '  ',
      }),
    ).rejects.toThrow(/reasonForVisit/);
    await expect(
      service.recordTriage('v1', {
        ...triageBody,
        chiefComplaint: '',
      }),
    ).rejects.toThrow(/chiefComplaint/);

    const bad = async (vitals: Record<string, string>) =>
      service.recordTriage('v1', { ...triageBody, vitals: { ...triageBody.vitals, ...vitals } });

    await expect(bad({ systolic: '10' })).rejects.toThrow(/systolic/);
    await expect(bad({ diastolic: '5' })).rejects.toThrow(/diastolic/);
    await expect(bad({ pulse: '5' })).rejects.toThrow(/pulse/);
    await expect(bad({ respRate: '1' })).rejects.toThrow(/respRate/);
    await expect(bad({ spo2: '30' })).rejects.toThrow(/spo2/);
    await expect(bad({ weightKg: '0.1' })).rejects.toThrow(/weightKg/);
    await expect(bad({ heightCm: '10' })).rejects.toThrow(/heightCm/);
    await expect(bad({ painScore: '12' })).rejects.toThrow(/painScore/);
  });

  it('rejects appointment check-in for missing or terminal appointments', async () => {
    visits.findAppointment.mockResolvedValueOnce(null);
    await expect(
      service.checkIn(
        {
          patientName: 'Ann',
          mrn: 'MRN-1',
          appointmentId: 'missing-appt',
          paymentMethod: 'CASH',
        } as never,
        'u1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    visits.findAppointment.mockResolvedValueOnce({
      id: 'appt1',
      status: 'CANCELLED',
      doctorId: 'doc-1',
    });
    await expect(
      service.checkIn(
        {
          patientName: 'Ann',
          mrn: 'MRN-1',
          appointmentId: 'appt1',
          paymentMethod: 'CASH',
        } as never,
        'u1',
      ),
    ).rejects.toThrow(/Cannot check in appointment/);
  });

  it('isConsultationFeeEnabled falls back when settings throw', async () => {
    prisma.isConnected = true;
    prisma.settings.findUnique.mockRejectedValueOnce(new Error('db down'));
    expect(await service.isConsultationFeeEnabled()).toBe(true);
  });

  it('collectConsultFee requires awaiting payment and linked invoice', async () => {
    visits.findById.mockResolvedValue(row({ stage: 'CHECKED_IN' }));
    await expect(
      service.collectConsultFee('v1', 'u1', 'CASH'),
    ).rejects.toThrow(/not waiting/);

    visits.findById.mockResolvedValue(
      row({
        stage: 'AWAITING_PAYMENT',
        payload: { billing: { consultFeeStatus: 'PENDING' } },
      }),
    );
    await expect(
      service.collectConsultFee('v1', 'u1', 'CASH'),
    ).rejects.toThrow(/No consultation-fee invoice/);
  });

  it('saveClinicalRecord rejects outside doctor stages', async () => {
    visits.findById.mockResolvedValue(row({ stage: 'CHECKED_IN' }));
    await expect(
      service.saveClinicalRecord('v1', { chiefComplaint: 'x' } as never),
    ).rejects.toThrow(/with the doctor/);
  });
});
