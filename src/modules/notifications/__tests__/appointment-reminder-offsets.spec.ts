import { DomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import { NotificationPolicyService } from '../policy/notification-policy.service';
import { NOTIFICATION_JOBS } from '../jobs/notification.jobs';

describe('appointment reminder offsets', () => {
  const policy = new NotificationPolicyService();

  it('schedules 2d, 5h, 30m, 15m with idempotent job ids', () => {
    const startsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const event: DomainEventEnvelope = {
      id: 'evt-1',
      type: 'appointment.created',
      occurredAt: new Date().toISOString(),
      payload: {
        appointmentId: 'appt-1',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        startsAt,
        doctorUserId: 'user-doc',
      },
    };

    const intent = policy.evaluate(event);
    expect(intent).toBeTruthy();
    const reminderJobs = (intent!.jobs ?? []).filter(
      (j) => j.name === NOTIFICATION_JOBS.APPOINTMENT_REMINDER,
    );
    expect(reminderJobs).toHaveLength(4);
    const ids = reminderJobs.map((j) => j.jobId).sort();
    expect(ids).toEqual([
      'appointment-reminder:appt-1:15m',
      'appointment-reminder:appt-1:2d',
      'appointment-reminder:appt-1:30m',
      'appointment-reminder:appt-1:5h',
    ].sort());
  });

  it('skips offsets that are already in the past', () => {
    const startsAt = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20m
    const event: DomainEventEnvelope = {
      id: 'evt-2',
      type: 'appointment.created',
      occurredAt: new Date().toISOString(),
      payload: {
        appointmentId: 'appt-2',
        patientId: 'pat-1',
        doctorId: 'doc-1',
        startsAt,
      },
    };
    const intent = policy.evaluate(event);
    const reminderJobs = (intent!.jobs ?? []).filter(
      (j) => j.name === NOTIFICATION_JOBS.APPOINTMENT_REMINDER,
    );
    // Only 15m is still in the future
    expect(reminderJobs).toHaveLength(1);
    expect(reminderJobs[0].jobId).toBe('appointment-reminder:appt-2:15m');
  });
});
