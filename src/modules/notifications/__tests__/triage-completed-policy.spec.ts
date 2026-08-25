import type { DomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import { NotificationPolicyService } from '../policy/notification-policy.service';
import { NOTIFICATION_JOBS } from '../jobs/notification.jobs';

describe('triage.completed policy', () => {
  const policy = new NotificationPolicyService();

  it('notifies assigned doctor via durable + WS + FCM', () => {
    const event: DomainEventEnvelope = {
      id: 'evt-triage',
      type: 'triage.completed',
      occurredAt: new Date().toISOString(),
      payload: {
        visitId: 'visit-1',
        doctorUserId: 'doc-user',
        patientName: 'John',
        mrn: 'MRN-9',
        priority: 'URGENT',
      },
    };
    const intent = policy.evaluate(event);
    expect(intent).toBeTruthy();
    expect(intent!.durable[0]).toMatchObject({
      userId: 'doc-user',
      notificationType: 'triage.completed',
    });
    expect(
      intent!.jobs.some((j) => j.name === NOTIFICATION_JOBS.SEND_WEBSOCKET),
    ).toBe(true);
    expect(
      intent!.jobs.some((j) => j.name === NOTIFICATION_JOBS.SEND_FCM),
    ).toBe(true);
  });

  it('returns null when no doctor assigned', () => {
    const event: DomainEventEnvelope = {
      id: 'evt-triage-2',
      type: 'triage.completed',
      occurredAt: new Date().toISOString(),
      payload: { visitId: 'visit-2' },
    };
    expect(policy.evaluate(event)).toBeNull();
  });
});
