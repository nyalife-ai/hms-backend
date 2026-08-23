/**
 * DomainNotificationListener — domain/legacy event bridges with mocked dispatcher.
 */

import { DomainNotificationListener } from '../listeners/domain-notification.listener';
import { DOMAIN_EVENT_TYPES } from '../policy/notification-policy.service';
import { createDomainEventEnvelope } from '../infrastructure/domain-event.envelope';

describe('DomainNotificationListener', () => {
  const dispatcher = {
    cancelJob: jest.fn().mockResolvedValue(undefined),
    dispatchDomainEvent: jest
      .fn()
      .mockResolvedValue({ queued: 1, persisted: 1 }),
  };
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    laboratoryRequests: { findFirst: jest.fn().mockResolvedValue(null) },
    outpatientVisits: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  let listener: DomainNotificationListener;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = new DomainNotificationListener(
      dispatcher as never,
      prisma as never,
    );
  });

  it('dispatches normalized domain events', async () => {
    const envelope = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.VISIT_COMPLETED,
      payload: { visitId: 'v1' },
    });
    await listener.onDomainEvent(envelope);
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalled();
  });

  it('cancels appointment reminder jobs on cancellation', async () => {
    const envelope = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.APPOINTMENT_CANCELLED,
      payload: { appointmentId: 'a1' },
    });
    await listener.onDomainEvent(envelope);
    expect(dispatcher.cancelJob).toHaveBeenCalledWith(
      'appointment-reminder:a1',
    );
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalled();
  });

  it('skips cancelJob when cancelled payload lacks appointmentId', async () => {
    const envelope = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.APPOINTMENT_CANCELLED,
      payload: {},
    });
    await listener.onDomainEvent(envelope);
    expect(dispatcher.cancelJob).not.toHaveBeenCalled();
  });

  it('swallows dispatcher failures', async () => {
    dispatcher.dispatchDomainEvent.mockRejectedValueOnce(new Error('boom'));
    const envelope = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.PAYMENT_RECEIVED,
      payload: { paymentId: 'pay1' },
    });
    await expect(listener.onDomainEvent(envelope)).resolves.toBeUndefined();
  });

  it('swallows non-Error dispatcher failures', async () => {
    dispatcher.dispatchDomainEvent.mockRejectedValueOnce('string-fail');
    const envelope = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.PAYMENT_FAILED,
      payload: { paymentId: 'pay2' },
    });
    await expect(listener.onDomainEvent(envelope)).resolves.toBeUndefined();
  });

  it('ignores unparseable events', async () => {
    await listener.onDomainEvent({});
    expect(dispatcher.dispatchDomainEvent).not.toHaveBeenCalled();
  });

  it('enriches billing / pharmacy / radiology / admission recipients when missing', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

    await listener.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.VISIT_READY_FOR_BILLING,
        payload: { visitId: 'v1' },
      }),
    );
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          billingUserIds: ['r1', 'r2'],
        }),
      }),
    );

    await listener.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.PRESCRIPTION_CREATED,
        payload: { prescriptionId: 'rx1' },
      }),
    );
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          pharmacistUserIds: ['r1', 'r2'],
        }),
      }),
    );

    await listener.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.RADIOLOGY_REQUEST_CREATED,
        payload: { requestId: 'rad1' },
      }),
    );
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          radiologistUserIds: ['r1', 'r2'],
        }),
      }),
    );

    await listener.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.ADMISSION_CREATED,
        payload: { admissionId: 'adm1' },
      }),
    );
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ nurseUserIds: ['r1', 'r2'] }),
      }),
    );
  });

  it('does not re-resolve recipients when already provided', async () => {
    await listener.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.VISIT_READY_FOR_BILLING,
        payload: { visitId: 'v1', billingUserIds: ['b1'] },
      }),
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();

    await listener.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.PRESCRIPTION_CREATED,
        payload: { prescriptionId: 'rx1', pharmacistUserIds: ['p1'] },
      }),
    );
    await listener.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.RADIOLOGY_REQUEST_CREATED,
        payload: { requestId: 'rad1', radiologistUserIds: ['rad'] },
      }),
    );
    await listener.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.ADMISSION_TRANSFERRED,
        payload: { admissionId: 'adm1', nurseUserIds: ['n1'] },
      }),
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('bridges lab requested / released / critical events', async () => {
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'tech1' }]);
    await listener.onLabRequested({ requestId: 'lr1', priority: 'STAT' });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT_TYPES.LAB_REQUEST_CREATED,
        payload: expect.objectContaining({
          requestId: 'lr1',
          priority: 'STAT',
          technicianUserIds: ['tech1'],
        }),
      }),
    );

    await listener.onLabRequested({});
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledTimes(1);

    prisma.laboratoryRequests.findFirst.mockResolvedValueOnce({
      requesting_doctor_id: 'doc1',
      requesting_doctor: { user_id: 'du1' },
    });
    await listener.onLabReleased({ requestId: 'lr2', visitId: 'v1' });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT_TYPES.LAB_RESULTS_READY,
        payload: expect.objectContaining({
          requestId: 'lr2',
          doctorUserId: 'du1',
        }),
      }),
    );

    await listener.onLabReleased({});
    prisma.laboratoryRequests.findFirst.mockRejectedValueOnce(new Error('db'));
    await listener.onLabCritical({ requestId: 'lr3' });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT_TYPES.LAB_RESULTS_CRITICAL,
        payload: expect.objectContaining({
          requestId: 'lr3',
          doctorUserId: undefined,
        }),
      }),
    );

    await listener.onLabCritical({});
  });

  it('bridges IPD admit / transfer / discharge events', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'nurse1' }]);

    await listener.onAdmitted({ admissionId: 'a1', patientId: 'p1' });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT_TYPES.ADMISSION_CREATED,
        payload: expect.objectContaining({
          admissionId: 'a1',
          nurseUserIds: ['nurse1'],
        }),
      }),
    );
    await listener.onAdmitted({});

    await listener.onTransferred({ admissionId: 'a2' });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT_TYPES.ADMISSION_TRANSFERRED,
      }),
    );
    await listener.onTransferred({});

    await listener.onDischarged({ admissionId: 'a3', patientId: 'p3' });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT_TYPES.ADMISSION_DISCHARGED,
      }),
    );
    await listener.onDischarged({});
  });

  it('bridges pharmacy dispensed and resolves visit patient', async () => {
    prisma.outpatientVisits.findFirst.mockResolvedValueOnce({
      patient_id: 'pat1',
    });
    await listener.onDispensed({ visitId: 'v1', dispensed: 2 });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: DOMAIN_EVENT_TYPES.PRESCRIPTION_DISPENSED,
        payload: expect.objectContaining({
          patientId: 'pat1',
          prescriptionId: 'v1',
        }),
      }),
    );

    await listener.onDispensed({});
    prisma.outpatientVisits.findFirst.mockRejectedValueOnce('db-down');
    await listener.onDispensed({ visitId: 'v2' });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ patientId: undefined }),
      }),
    );
  });

  it('returns empty role ids when prisma user lookup fails', async () => {
    prisma.user.findMany.mockRejectedValueOnce(new Error('roles down'));
    await listener.onLabRequested({ requestId: 'lr9' });
    expect(dispatcher.dispatchDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ technicianUserIds: [] }),
      }),
    );

    prisma.user.findMany.mockRejectedValueOnce('string');
    await listener.onAdmitted({ admissionId: 'a9' });
  });

  it('wrap helper builds envelope', () => {
    const env = DomainNotificationListener.wrap(
      DOMAIN_EVENT_TYPES.INVOICE_ISSUED,
      { invoiceId: 'i1' },
      'actor1',
    );
    expect(env.type).toBe(DOMAIN_EVENT_TYPES.INVOICE_ISSUED);
    expect(env.payload).toEqual({ invoiceId: 'i1' });
    expect(env.actorId).toBe('actor1');
  });
});
