import type { DomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import { NotificationPolicyService } from '../policy/notification-policy.service';
import { NOTIFICATION_JOBS } from '../jobs/notification.jobs';

describe('payment.failed staff channels', () => {
  const policy = new NotificationPolicyService();

  it('persists durable row and enqueues WS + FCM for staff', () => {
    const event: DomainEventEnvelope = {
      id: 'evt-pay-fail',
      type: 'payment.failed',
      occurredAt: new Date().toISOString(),
      payload: {
        paymentId: 'pay-1',
        checkoutId: 'co-1',
        amount: 6100,
        reason: 'Customer cancelled',
        patientName: 'Jane Doe',
        mrn: 'MRN-1',
        initiatedBy: 'user-init',
        notifyUserIds: ['user-init', 'user-admin'],
      },
    };

    const intent = policy.evaluate(event);
    expect(intent).toBeTruthy();
    expect(intent!.durable.length).toBeGreaterThanOrEqual(2);
    const ws = intent!.jobs.filter(
      (j) => j.name === NOTIFICATION_JOBS.SEND_WEBSOCKET,
    );
    const fcm = intent!.jobs.filter(
      (j) => j.name === NOTIFICATION_JOBS.SEND_FCM,
    );
    expect(ws.length).toBeGreaterThanOrEqual(2);
    expect(fcm.length).toBeGreaterThanOrEqual(2);
    expect(fcm[0].data).toMatchObject({
      templateKey: 'payment.failed.staff.push',
    });
  });
});
