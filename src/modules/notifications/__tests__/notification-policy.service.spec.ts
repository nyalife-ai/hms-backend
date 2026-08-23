/**
 * NotificationPolicyService — domain event → durable/job intents.
 */

import { NotificationPolicyService, DOMAIN_EVENT_TYPES } from '../policy/notification-policy.service';
import { createDomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import { NOTIFICATION_JOBS } from '../jobs/notification.jobs';

describe('NotificationPolicyService', () => {
  const policy = new NotificationPolicyService();

  const envelope = <T extends object>(type: string, payload: T) =>
    createDomainEventEnvelope({ type, payload });

  it('returns null for silent auth events and unknown types', () => {
    expect(
      policy.evaluate(
        envelope(DOMAIN_EVENT_TYPES.AUTH_LOGIN_SUCCESS, { userId: 'u1' }),
      ),
    ).toBeNull();
    expect(
      policy.evaluate(envelope('totally.unknown.event', { x: 1 })),
    ).toBeNull();
  });

  it('builds appointment created intents with optional reminder', () => {
    const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const intent = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.APPOINTMENT_CREATED, {
        appointmentId: 'a1',
        patientId: 'p1',
        doctorId: 'd1',
        startsAt,
        doctorUserId: 'du1',
      }),
    );
    expect(intent).not.toBeNull();
    expect(intent!.durable).toHaveLength(1);
    expect(intent!.durable[0].userId).toBe('du1');
    expect(
      intent!.jobs.some((j) => j.name === NOTIFICATION_JOBS.SEND_FCM),
    ).toBe(true);
    expect(
      intent!.jobs.some((j) => j.name === NOTIFICATION_JOBS.APPOINTMENT_REMINDER),
    ).toBe(true);
  });

  it('handles check-in, cancel, and reschedule', () => {
    expect(
      policy.evaluate(
        envelope(DOMAIN_EVENT_TYPES.APPOINTMENT_CHECKED_IN, {
          appointmentId: 'a1',
        }),
      ),
    ).toBeNull();

    const checked = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.APPOINTMENT_CHECKED_IN, {
        appointmentId: 'a1',
        doctorUserId: 'du1',
      }),
    );
    expect(checked?.durable[0].notificationType).toBe('appointment.checked_in');

    const cancelled = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.APPOINTMENT_CANCELLED, {
        appointmentId: 'a1',
        patientId: 'p1',
      }),
    );
    expect(cancelled).not.toBeNull();

    const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const rescheduled = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.APPOINTMENT_RESCHEDULED, {
        appointmentId: 'a1',
        patientId: 'p1',
        doctorId: 'd1',
        startsAt,
        doctorUserId: 'du1',
      }),
    );
    expect(rescheduled?.jobs.length).toBeGreaterThan(0);
  });

  it('maps lab, admission, prescription, and billing patient SMS events', () => {
    const labReq = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.LAB_REQUEST_CREATED, {
        requestId: 'lr1',
        technicianUserIds: ['tech1'],
      }),
    );
    expect(labReq?.durable[0].userId).toBe('tech1');

    const labReady = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.LAB_RESULTS_READY, {
        requestId: 'lr1',
        doctorUserId: 'du1',
      }),
    );
    expect(labReady?.durable[0].notificationType).toContain('lab');

    const labCrit = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.LAB_RESULTS_CRITICAL, {
        requestId: 'lr1',
        doctorUserId: 'du1',
      }),
    );
    expect(labCrit?.durable[0].priority).toBeDefined();

    for (const type of [
      DOMAIN_EVENT_TYPES.ADMISSION_CREATED,
      DOMAIN_EVENT_TYPES.ADMISSION_TRANSFERRED,
      DOMAIN_EVENT_TYPES.ADMISSION_DISCHARGED,
    ]) {
      const intent = policy.evaluate(
        envelope(type, { admissionId: 'ad1', nurseUserIds: ['n1'] }),
      );
      expect(intent?.durable[0].userId).toBe('n1');
    }

    const rx = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.PRESCRIPTION_CREATED, {
        prescriptionId: 'rx1',
        pharmacistUserIds: ['ph1'],
      }),
    );
    expect(rx?.durable[0].userId).toBe('ph1');

    const dispensed = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.PRESCRIPTION_DISPENSED, {
        patientId: 'p1',
        prescriptionId: 'rx1',
      }),
    );
    expect(dispensed).not.toBeNull();

    for (const type of [
      DOMAIN_EVENT_TYPES.PAYMENT_RECEIVED,
      DOMAIN_EVENT_TYPES.PAYMENT_FAILED,
      DOMAIN_EVENT_TYPES.INVOICE_ISSUED,
      DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_SUBMITTED,
      DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_APPROVED,
      DOMAIN_EVENT_TYPES.VISIT_COMPLETED,
    ]) {
      const intent = policy.evaluate(envelope(type, { patientId: 'p1' }));
      expect(intent).not.toBeNull();
      expect(intent!.jobs.some((j) => j.name === NOTIFICATION_JOBS.SEND_SMS)).toBe(
        true,
      );
    }

    const denied = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_DENIED, {
        patientId: 'p1',
        claimId: 'c1',
        claimNumber: 'CLM-1',
      }),
    );
    expect(denied).not.toBeNull();
  });

  it('maps visit/radiology/auth security events', () => {
    const results = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.VISIT_RESULTS_READY, {
        visitId: 'v1',
        doctorUserId: 'du1',
      }),
    );
    expect(results?.durable[0].entityId).toBe('v1');

    const billing = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.VISIT_READY_FOR_BILLING, {
        visitId: 'v1',
        billingUserIds: ['b1'],
      }),
    );
    expect(billing?.durable[0].userId).toBe('b1');

    const radReady = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.RADIOLOGY_REPORT_READY, {
        requestId: 'r1',
        doctorUserId: 'du1',
      }),
    );
    expect(radReady?.durable.length).toBe(1);

    const radReq = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.RADIOLOGY_REQUEST_CREATED, {
        requestId: 'r1',
        radiologistUserIds: ['rad1'],
      }),
    );
    expect(radReq?.durable[0].userId).toBe('rad1');

    const security = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.AUTH_PASSWORD_CHANGED, { userId: 'u1' }),
    );
    expect(security?.durable[0].userId).toBe('u1');
  });

  it('notifies message recipients with durable + WS + FCM, skipping muted', () => {
    const intent = policy.evaluate(
      envelope(DOMAIN_EVENT_TYPES.MESSAGE_CREATED, {
        messageId: 'm1',
        conversationId: 'c1',
        senderId: 's1',
        preview: 'Hello colleague',
        recipientUserIds: ['r1', 'r2', 's1'],
        mutedUserIds: ['r2'],
      }),
    );
    expect(intent).not.toBeNull();
    expect(intent!.durable).toHaveLength(1);
    expect(intent!.durable[0].userId).toBe('r1');
    expect(intent!.durable[0].actionPath).toBe('/messages?c=c1');
    expect(intent!.durable[0].entityType).toBe('MESSAGE');
    const jobNames = intent!.jobs.map((j) => j.name);
    expect(jobNames).toContain(NOTIFICATION_JOBS.SEND_WEBSOCKET);
    expect(jobNames).toContain(NOTIFICATION_JOBS.SEND_FCM);
    expect(jobNames).not.toContain(NOTIFICATION_JOBS.SEND_EMAIL);
  });
});
