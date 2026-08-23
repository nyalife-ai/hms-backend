/**
 * Maps domain events → durable notifications + channel jobs.
 * Central place for wording, recipients, channels, priority, navigation.
 * Domain modules must not call SMS/FCM/email providers directly.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import {
  durableKey,
  NOTIFICATION_JOBS,
  type DurableNotificationSpec,
  type NotificationIntent,
  type QueuedNotificationJob,
} from '../jobs/notification.jobs';

export const DOMAIN_EVENT_TYPES = {
  APPOINTMENT_CREATED: 'appointment.created',
  APPOINTMENT_CHECKED_IN: 'appointment.checked_in',
  APPOINTMENT_CANCELLED: 'appointment.cancelled',
  APPOINTMENT_RESCHEDULED: 'appointment.rescheduled',
  LAB_REQUEST_CREATED: 'laboratory.request_created',
  LAB_RESULTS_READY: 'laboratory.results_ready',
  LAB_RESULTS_CRITICAL: 'laboratory.results_critical',
  ADMISSION_CREATED: 'admission.created',
  ADMISSION_TRANSFERRED: 'admission.transferred',
  ADMISSION_DISCHARGED: 'admission.discharged',
  PRESCRIPTION_CREATED: 'prescription.created',
  PRESCRIPTION_DISPENSED: 'prescription.dispensed',
  INVOICE_ISSUED: 'invoice.issued',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_FAILED: 'payment.failed',
  INSURANCE_CLAIM_SUBMITTED: 'insurance_claim.submitted',
  INSURANCE_CLAIM_APPROVED: 'insurance_claim.approved',
  INSURANCE_CLAIM_DENIED: 'insurance_claim.denied',
  VISIT_RESULTS_READY: 'visit.results_ready',
  VISIT_READY_FOR_BILLING: 'visit.ready_for_billing',
  VISIT_COMPLETED: 'visit.completed',
  RADIOLOGY_REPORT_READY: 'radiology.report_ready',
  RADIOLOGY_REQUEST_CREATED: 'radiology.request_created',
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILED: 'auth.login.failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGED: 'auth.password.changed',
  AUTH_ACCOUNT_SECURITY_CHANGED: 'auth.account.security.changed',
  MESSAGE_CREATED: 'message.created',
} as const;

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

type ApptPayload = {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  doctorUserId?: string;
};

function intent(
  event: DomainEventEnvelope,
  durable: DurableNotificationSpec[],
  jobs: QueuedNotificationJob[],
): NotificationIntent {
  return {
    eventId: event.id,
    eventType: event.type,
    durable,
    jobs,
  };
}

function staffDurable(
  event: DomainEventEnvelope,
  opts: {
    userId: string;
    type: string;
    title: string;
    body: string;
    priority?: string;
    entityType?: string;
    entityId?: string;
    actionPath?: string;
  },
): DurableNotificationSpec {
  return {
    userId: opts.userId,
    notificationType: opts.type,
    title: opts.title,
    body: opts.body,
    priority: opts.priority ?? 'NORMAL',
    entityType: opts.entityType,
    entityId: opts.entityId,
    actionPath: opts.actionPath,
    idempotencyKey: durableKey(event.id, opts.userId, opts.type),
  };
}

@Injectable()
export class NotificationPolicyService {
  private readonly logger = new Logger(NotificationPolicyService.name);

  public evaluate(event: DomainEventEnvelope): NotificationIntent | null {
    switch (event.type) {
      case DOMAIN_EVENT_TYPES.APPOINTMENT_CREATED:
        return this.onAppointmentCreated(
          event as DomainEventEnvelope<ApptPayload>,
        );
      case DOMAIN_EVENT_TYPES.APPOINTMENT_CANCELLED:
        return this.onAppointmentCancelled(
          event as DomainEventEnvelope<{
            appointmentId: string;
            patientId: string;
            appointmentDate?: string;
          }>,
        );
      case DOMAIN_EVENT_TYPES.APPOINTMENT_RESCHEDULED:
        return this.onAppointmentRescheduled(
          event as DomainEventEnvelope<ApptPayload>,
        );
      case DOMAIN_EVENT_TYPES.APPOINTMENT_CHECKED_IN:
        return this.onAppointmentCheckedIn(
          event as DomainEventEnvelope<{
            appointmentId: string;
            doctorUserId?: string;
          }>,
        );
      case DOMAIN_EVENT_TYPES.LAB_REQUEST_CREATED:
        return this.onLabRequestCreated(
          event as DomainEventEnvelope<{
            requestId: string;
            priority?: string;
            technicianUserIds?: string[];
          }>,
        );
      case DOMAIN_EVENT_TYPES.LAB_RESULTS_READY:
        return this.onLabResultsReady(
          event as DomainEventEnvelope<{
            requestId: string;
            doctorUserId?: string;
          }>,
        );
      case DOMAIN_EVENT_TYPES.LAB_RESULTS_CRITICAL:
        return this.onLabResultsCritical(
          event as DomainEventEnvelope<{
            requestId: string;
            doctorUserId?: string;
          }>,
        );
      case DOMAIN_EVENT_TYPES.ADMISSION_CREATED:
      case DOMAIN_EVENT_TYPES.ADMISSION_TRANSFERRED:
      case DOMAIN_EVENT_TYPES.ADMISSION_DISCHARGED:
        return this.onAdmissionLifecycle(
          event as DomainEventEnvelope<{
            admissionId: string;
            nurseUserIds?: string[];
          }>,
        );
      case DOMAIN_EVENT_TYPES.PRESCRIPTION_CREATED:
        return this.onPrescriptionCreated(
          event as DomainEventEnvelope<{
            prescriptionId: string;
            pharmacistUserIds?: string[];
          }>,
        );
      case DOMAIN_EVENT_TYPES.PRESCRIPTION_DISPENSED:
        return this.onPrescriptionDispensed(
          event as DomainEventEnvelope<{
            patientId?: string;
            prescriptionId?: string;
          }>,
        );
      case DOMAIN_EVENT_TYPES.PAYMENT_RECEIVED:
        return this.patientSms(
          event,
          'payment.received.patient.sms',
          event.payload as { patientId?: string },
        );
      case DOMAIN_EVENT_TYPES.PAYMENT_FAILED:
        return this.patientSms(
          event,
          'payment.failed.patient.sms',
          event.payload as { patientId?: string },
        );
      case DOMAIN_EVENT_TYPES.INVOICE_ISSUED:
        return this.patientSms(
          event,
          'invoice.issued.patient.sms',
          event.payload as { patientId?: string },
          event.payload as Record<string, string>,
        );
      case DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_SUBMITTED:
        return this.patientSms(
          event,
          'insurance_claim.submitted.patient.sms',
          event.payload as { patientId?: string },
          event.payload as Record<string, string>,
        );
      case DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_APPROVED:
        return this.patientSms(
          event,
          'insurance_claim.approved.patient.sms',
          event.payload as { patientId?: string },
          event.payload as Record<string, string>,
        );
      case DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_DENIED:
        return this.onInsuranceClaimDenied(
          event as DomainEventEnvelope<{
            patientId?: string;
            claimId?: string;
            claimNumber?: string;
          }>,
        );
      case DOMAIN_EVENT_TYPES.VISIT_RESULTS_READY:
        return this.onVisitResultsReady(
          event as DomainEventEnvelope<{
            visitId: string;
            doctorUserId?: string;
          }>,
        );
      case DOMAIN_EVENT_TYPES.VISIT_READY_FOR_BILLING:
        return this.onVisitReadyForBilling(
          event as DomainEventEnvelope<{
            visitId: string;
            billingUserIds?: string[];
          }>,
        );
      case DOMAIN_EVENT_TYPES.VISIT_COMPLETED:
        return this.patientSms(
          event,
          'visit.completed.patient.sms',
          event.payload as { patientId?: string },
        );
      case DOMAIN_EVENT_TYPES.RADIOLOGY_REPORT_READY:
        return this.onRadiologyReportReady(
          event as DomainEventEnvelope<{
            requestId: string;
            doctorUserId?: string;
          }>,
        );
      case DOMAIN_EVENT_TYPES.RADIOLOGY_REQUEST_CREATED:
        return this.onRadiologyRequestCreated(
          event as DomainEventEnvelope<{
            requestId: string;
            radiologistUserIds?: string[];
          }>,
        );
      case DOMAIN_EVENT_TYPES.AUTH_PASSWORD_CHANGED:
      case DOMAIN_EVENT_TYPES.AUTH_ACCOUNT_SECURITY_CHANGED:
        return this.onAuthSecurity(
          event as DomainEventEnvelope<{ userId: string }>,
        );
      case DOMAIN_EVENT_TYPES.MESSAGE_CREATED:
        return this.onMessageCreated(
          event as DomainEventEnvelope<{
            messageId: string;
            conversationId: string;
            senderId: string;
            preview?: string;
            recipientUserIds?: string[];
            mutedUserIds?: string[];
          }>,
        );
      case DOMAIN_EVENT_TYPES.AUTH_LOGIN_SUCCESS:
      case DOMAIN_EVENT_TYPES.AUTH_LOGIN_FAILED:
      case DOMAIN_EVENT_TYPES.AUTH_LOGOUT:
        // Silent for notification center / FCM — audit already records these.
        return null;
      default:
        this.logger.debug(`No notification policy for type=${event.type}`);
        return null;
    }
  }

  private onMessageCreated(
    event: DomainEventEnvelope<{
      messageId: string;
      conversationId: string;
      senderId: string;
      senderName?: string;
      preview?: string;
      recipientUserIds?: string[];
      mutedUserIds?: string[];
    }>,
  ): NotificationIntent | null {
    const p = event.payload;
    const muted = new Set(p.mutedUserIds ?? []);
    const recipients = (p.recipientUserIds ?? []).filter(
      (id) => id && id !== p.senderId && !muted.has(id),
    );
    if (!recipients.length) return null;

    const senderName = (p.senderName ?? '').trim() || 'a colleague';
    const rawPreview = (p.preview ?? '').trim();
    const body = rawPreview
      ? rawPreview.slice(0, 120)
      : 'You have a new message.';
    const title = `New message from ${senderName}`;
    const durable: DurableNotificationSpec[] = [];
    const jobs: QueuedNotificationJob[] = [];

    for (const userId of recipients) {
      durable.push(
        staffDurable(event, {
          userId,
          type: DOMAIN_EVENT_TYPES.MESSAGE_CREATED,
          title,
          body,
          entityType: 'MESSAGE',
          entityId: p.messageId,
          actionPath: `/messages?c=${p.conversationId}`,
        }),
      );
      // Notification-center / sound only — chat content is already on the wire
      // via MessagingService.publishRealtime (rich payload).
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:message-notif:${p.messageId}:${userId}`,
        data: {
          eventId: event.id,
          type: DOMAIN_EVENT_TYPES.MESSAGE_CREATED,
          userId,
          payload: {
            messageId: p.messageId,
            conversationId: p.conversationId,
            senderId: p.senderId,
            senderName,
            preview: body,
          },
          dedupeKey: `ws:message-notif:${event.id}:${userId}`,
        },
      });
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_FCM,
        jobId: `fcm:message-created:${p.messageId}:${userId}`,
        data: {
          eventId: event.id,
          templateKey: 'message.created.push',
          userId,
          variables: {
            senderName,
            preview: body,
            conversationId: p.conversationId,
            messageId: p.messageId,
            actionPath: `/messages?c=${p.conversationId}`,
            url: `/messages?c=${p.conversationId}`,
          },
          dedupeKey: `fcm:message-created:${event.id}:${userId}`,
        },
      });
    }

    return intent(event, durable, jobs);
  }

  private onAppointmentCreated(
    event: DomainEventEnvelope<ApptPayload>,
  ): NotificationIntent {
    const p = event.payload;
    const durable: DurableNotificationSpec[] = [];
    const jobs: QueuedNotificationJob[] = [];

    if (p.doctorUserId) {
      durable.push(
        staffDurable(event, {
          userId: p.doctorUserId,
          type: 'appointment.created',
          title: 'New appointment',
          body: 'A new appointment was scheduled for you.',
          entityType: 'appointment',
          entityId: p.appointmentId,
          actionPath: '/appointments',
        }),
      );
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:appt-created:${p.appointmentId}:${p.doctorUserId}`,
        data: {
          eventId: event.id,
          type: 'appointment.created',
          userId: p.doctorUserId,
          room: `user:${p.doctorUserId}`,
          payload: { appointmentId: p.appointmentId },
          dedupeKey: `ws:appt-created:${event.id}:${p.doctorUserId}`,
        },
      });
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_FCM,
        jobId: `fcm:appt-created:${p.appointmentId}:${p.doctorUserId}`,
        data: {
          eventId: event.id,
          templateKey: 'appointment.created.doctor.push',
          userId: p.doctorUserId,
          variables: { appointmentId: p.appointmentId },
          dedupeKey: `fcm:appt-created:${event.id}:${p.doctorUserId}`,
        },
      });
    }

    const startsAtMs = Date.parse(p.startsAt);
    if (Number.isFinite(startsAtMs)) {
      const delayMs = startsAtMs - Date.now() - TWO_DAYS_MS;
      if (delayMs > 0) {
        jobs.push({
          name: NOTIFICATION_JOBS.APPOINTMENT_REMINDER,
          delayMs,
          jobId: `appointment-reminder:${p.appointmentId}`,
          data: {
            eventId: event.id,
            appointmentId: p.appointmentId,
            expectedStartsAt: p.startsAt,
            dedupeKey: `reminder:${p.appointmentId}:${p.startsAt}`,
          },
        });
      }
    }

    return intent(event, durable, jobs);
  }

  private onAppointmentCheckedIn(
    event: DomainEventEnvelope<{
      appointmentId: string;
      doctorUserId?: string;
    }>,
  ): NotificationIntent | null {
    const p = event.payload;
    if (!p.doctorUserId) return null;
    return intent(
      event,
      [
        staffDurable(event, {
          userId: p.doctorUserId,
          type: 'appointment.checked_in',
          title: 'Patient checked in',
          body: 'A patient is ready for consultation.',
          entityType: 'appointment',
          entityId: p.appointmentId,
          actionPath: '/consultations',
        }),
      ],
      [
        {
          name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
          jobId: `ws:appt-checkin:${p.appointmentId}`,
          data: {
            eventId: event.id,
            type: 'appointment.checked_in',
            userId: p.doctorUserId,
            payload: { appointmentId: p.appointmentId },
            dedupeKey: `ws:appt-checkin:${event.id}`,
          },
        },
      ],
    );
  }

  private onAppointmentCancelled(
    event: DomainEventEnvelope<{
      appointmentId: string;
      patientId: string;
      appointmentDate?: string;
    }>,
  ): NotificationIntent {
    const p = event.payload;
    return intent(event, [], [
      {
        name: NOTIFICATION_JOBS.SEND_SMS,
        jobId: `sms:appt-cancelled:${p.appointmentId}`,
        data: {
          eventId: event.id,
          templateKey: 'appointment.cancelled.patient.sms',
          patientId: p.patientId,
          variables: { appointmentDate: p.appointmentDate ?? '' },
          dedupeKey: `sms:appt-cancelled:${event.id}`,
        },
      },
    ]);
  }

  private onAppointmentRescheduled(
    event: DomainEventEnvelope<ApptPayload>,
  ): NotificationIntent {
    const created = this.onAppointmentCreated(event);
    const p = event.payload;
    return intent(event, created.durable, [
      {
        name: NOTIFICATION_JOBS.SEND_SMS,
        jobId: `sms:appt-rescheduled:${p.appointmentId}:${p.startsAt}`,
        data: {
          eventId: event.id,
          templateKey: 'appointment.rescheduled.patient.sms',
          patientId: p.patientId,
          variables: { appointmentDate: p.startsAt },
          dedupeKey: `sms:appt-rescheduled:${event.id}`,
        },
      },
      ...created.jobs,
    ]);
  }

  private onLabRequestCreated(
    event: DomainEventEnvelope<{
      requestId: string;
      priority?: string;
      technicianUserIds?: string[];
    }>,
  ): NotificationIntent {
    const p = event.payload;
    const durable: DurableNotificationSpec[] = [];
    const jobs: QueuedNotificationJob[] = [
      {
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:lab-queue:${p.requestId}`,
        data: {
          eventId: event.id,
          type: 'laboratory.request_created',
          room: 'laboratory',
          payload: {
            requestId: p.requestId,
            priority: p.priority ?? 'NORMAL',
          },
          dedupeKey: `ws:lab-queue:${event.id}`,
        },
      },
    ];
    for (const userId of p.technicianUserIds ?? []) {
      durable.push(
        staffDurable(event, {
          userId,
          type: 'laboratory.request_created',
          title: 'New laboratory request',
          body: 'A new laboratory request is waiting in the queue.',
          priority: p.priority === 'STAT' || p.priority === 'URGENT' ? 'HIGH' : 'NORMAL',
          entityType: 'laboratory_request',
          entityId: p.requestId,
          actionPath: '/laboratory',
        }),
      );
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:lab-queue-user:${p.requestId}:${userId}`,
        data: {
          eventId: event.id,
          type: 'laboratory.request_created',
          userId,
          payload: { requestId: p.requestId, priority: p.priority ?? 'NORMAL' },
          dedupeKey: `ws:lab-queue-user:${event.id}:${userId}`,
        },
      });
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_FCM,
        jobId: `fcm:lab-queue:${p.requestId}:${userId}`,
        data: {
          eventId: event.id,
          templateKey: 'laboratory.request_created.tech.push',
          userId,
          variables: {
            requestId: p.requestId,
            priority: p.priority ?? 'NORMAL',
          },
          dedupeKey: `fcm:lab-queue:${event.id}:${userId}`,
        },
      });
    }
    return intent(event, durable, jobs);
  }

  private onLabResultsReady(
    event: DomainEventEnvelope<{ requestId: string; doctorUserId?: string }>,
  ): NotificationIntent | null {
    const p = event.payload;
    if (!p.doctorUserId) return null;
    return intent(
      event,
      [
        staffDurable(event, {
          userId: p.doctorUserId,
          type: 'laboratory.results_ready',
          title: 'Laboratory results ready',
          body: 'Laboratory results are ready for review.',
          entityType: 'laboratory_request',
          entityId: p.requestId,
          actionPath: '/laboratory',
        }),
      ],
      [
        {
          name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
          jobId: `ws:lab-ready:${p.requestId}`,
          data: {
            eventId: event.id,
            type: 'laboratory.results_ready',
            userId: p.doctorUserId,
            payload: { requestId: p.requestId },
            dedupeKey: `ws:lab-ready:${event.id}`,
          },
        },
        {
          name: NOTIFICATION_JOBS.SEND_FCM,
          jobId: `fcm:lab-ready:${p.requestId}`,
          data: {
            eventId: event.id,
            templateKey: 'laboratory.results_ready.doctor.push',
            userId: p.doctorUserId,
            variables: { requestId: p.requestId },
            dedupeKey: `fcm:lab-ready:${event.id}`,
          },
        },
      ],
    );
  }

  private onLabResultsCritical(
    event: DomainEventEnvelope<{ requestId: string; doctorUserId?: string }>,
  ): NotificationIntent | null {
    const p = event.payload;
    if (!p.doctorUserId) return null;
    return intent(
      event,
      [
        staffDurable(event, {
          userId: p.doctorUserId,
          type: 'laboratory.results_critical',
          title: 'Critical laboratory result',
          body: 'A critical laboratory result requires attention.',
          priority: 'CRITICAL',
          entityType: 'laboratory_request',
          entityId: p.requestId,
          actionPath: '/laboratory',
        }),
      ],
      [
        {
          name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
          jobId: `ws:lab-critical:${p.requestId}`,
          data: {
            eventId: event.id,
            type: 'laboratory.results_critical',
            userId: p.doctorUserId,
            payload: { requestId: p.requestId },
            dedupeKey: `ws:lab-critical:${event.id}`,
          },
        },
        {
          name: NOTIFICATION_JOBS.SEND_FCM,
          jobId: `fcm:lab-critical:${p.requestId}`,
          data: {
            eventId: event.id,
            templateKey: 'laboratory.results_critical.doctor.push',
            userId: p.doctorUserId,
            variables: { requestId: p.requestId },
            dedupeKey: `fcm:lab-critical:${event.id}`,
          },
        },
      ],
    );
  }

  private onAdmissionLifecycle(
    event: DomainEventEnvelope<{
      admissionId: string;
      nurseUserIds?: string[];
    }>,
  ): NotificationIntent {
    const p = event.payload;
    const title =
      event.type === DOMAIN_EVENT_TYPES.ADMISSION_CREATED
        ? 'Patient admitted'
        : event.type === DOMAIN_EVENT_TYPES.ADMISSION_TRANSFERRED
          ? 'Patient transferred'
          : 'Patient discharged';
    const durable: DurableNotificationSpec[] = [];
    const jobs: QueuedNotificationJob[] = [
      {
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:admission:${event.type}:${p.admissionId}`,
        data: {
          eventId: event.id,
          type: event.type,
          room: 'ipd',
          payload: { admissionId: p.admissionId },
          dedupeKey: `ws:admission:${event.id}`,
        },
      },
    ];
    for (const userId of p.nurseUserIds ?? []) {
      durable.push(
        staffDurable(event, {
          userId,
          type: event.type,
          title,
          body: `${title}. Open inpatient to continue care.`,
          entityType: 'admission',
          entityId: p.admissionId,
          actionPath: '/inpatient',
        }),
      );
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:admission-user:${event.type}:${p.admissionId}:${userId}`,
        data: {
          eventId: event.id,
          type: event.type,
          userId,
          payload: { admissionId: p.admissionId },
          dedupeKey: `ws:admission-user:${event.id}:${userId}`,
        },
      });
    }
    return intent(event, durable, jobs);
  }

  private onPrescriptionCreated(
    event: DomainEventEnvelope<{
      prescriptionId: string;
      pharmacistUserIds?: string[];
    }>,
  ): NotificationIntent {
    const p = event.payload;
    const durable: DurableNotificationSpec[] = [];
    const jobs: QueuedNotificationJob[] = [
      {
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:rx-created:${p.prescriptionId}`,
        data: {
          eventId: event.id,
          type: 'prescription.created',
          room: 'pharmacy',
          payload: { prescriptionId: p.prescriptionId },
          dedupeKey: `ws:rx-created:${event.id}`,
        },
      },
    ];
    for (const userId of p.pharmacistUserIds ?? []) {
      durable.push(
        staffDurable(event, {
          userId,
          type: 'prescription.created',
          title: 'New prescription',
          body: 'A new prescription is ready for pharmacy review.',
          entityType: 'prescription',
          entityId: p.prescriptionId,
          actionPath: '/pharmacy',
        }),
      );
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:rx-created-user:${p.prescriptionId}:${userId}`,
        data: {
          eventId: event.id,
          type: 'prescription.created',
          userId,
          payload: { prescriptionId: p.prescriptionId },
          dedupeKey: `ws:rx-created-user:${event.id}:${userId}`,
        },
      });
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_FCM,
        jobId: `fcm:rx-created:${p.prescriptionId}:${userId}`,
        data: {
          eventId: event.id,
          templateKey: 'prescription.created.pharmacy.push',
          userId,
          variables: { prescriptionId: p.prescriptionId },
          dedupeKey: `fcm:rx-created:${event.id}:${userId}`,
        },
      });
    }
    return intent(event, durable, jobs);
  }

  private onPrescriptionDispensed(
    event: DomainEventEnvelope<{
      patientId?: string;
      prescriptionId?: string;
    }>,
  ): NotificationIntent | null {
    const p = event.payload;
    if (!p.patientId) return null;
    return intent(event, [], [
      {
        name: NOTIFICATION_JOBS.SEND_SMS,
        jobId: `sms:rx-dispensed:${p.prescriptionId ?? event.id}`,
        data: {
          eventId: event.id,
          templateKey: 'prescription.dispensed.patient.sms',
          patientId: p.patientId,
          variables: {},
          dedupeKey: `sms:rx-dispensed:${event.id}`,
        },
      },
    ]);
  }

  private patientSms(
    event: DomainEventEnvelope,
    templateKey: string,
    payload: { patientId?: string },
    variables: Record<string, unknown> = {},
  ): NotificationIntent | null {
    if (!payload.patientId) return null;
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(variables)) {
      if (v === null || v === undefined) continue;
      vars[k] = String(v);
    }
    return intent(event, [], [
      {
        name: NOTIFICATION_JOBS.SEND_SMS,
        jobId: `sms:${templateKey}:${event.id}`,
        data: {
          eventId: event.id,
          templateKey,
          patientId: payload.patientId,
          variables: vars,
          dedupeKey: `sms:${templateKey}:${event.id}`,
        },
      },
    ]);
  }

  private onVisitResultsReady(
    event: DomainEventEnvelope<{ visitId: string; doctorUserId?: string }>,
  ): NotificationIntent | null {
    const p = event.payload;
    if (!p.doctorUserId) return null;
    return intent(
      event,
      [
        staffDurable(event, {
          userId: p.doctorUserId,
          type: 'visit.results_ready',
          title: 'Visit results ready',
          body: 'Clinical results are ready for this visit.',
          entityType: 'visit',
          entityId: p.visitId,
          actionPath: '/consultations',
        }),
      ],
      [
        {
          name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
          jobId: `ws:visit-results:${p.visitId}`,
          data: {
            eventId: event.id,
            type: 'visit.results_ready',
            userId: p.doctorUserId,
            payload: { visitId: p.visitId },
            dedupeKey: `ws:visit-results:${event.id}`,
          },
        },
        {
          name: NOTIFICATION_JOBS.SEND_FCM,
          jobId: `fcm:visit-results:${p.visitId}`,
          data: {
            eventId: event.id,
            templateKey: 'visit.results_ready.doctor.push',
            userId: p.doctorUserId,
            variables: { visitId: p.visitId },
            dedupeKey: `fcm:visit-results:${event.id}`,
          },
        },
      ],
    );
  }

  private onVisitReadyForBilling(
    event: DomainEventEnvelope<{
      visitId: string;
      billingUserIds?: string[];
    }>,
  ): NotificationIntent {
    const p = event.payload;
    const durable: DurableNotificationSpec[] = [];
    const jobs: QueuedNotificationJob[] = [
      {
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:visit-billing:${p.visitId}`,
        data: {
          eventId: event.id,
          type: 'visit.ready_for_billing',
          room: 'billing',
          payload: { visitId: p.visitId },
          dedupeKey: `ws:visit-billing:${event.id}`,
        },
      },
    ];
    for (const userId of p.billingUserIds ?? []) {
      durable.push(
        staffDurable(event, {
          userId,
          type: 'visit.ready_for_billing',
          title: 'Visit ready for billing',
          body: 'A visit is ready for billing.',
          entityType: 'visit',
          entityId: p.visitId,
          actionPath: '/billing',
        }),
      );
    }
    return intent(event, durable, jobs);
  }

  private onRadiologyReportReady(
    event: DomainEventEnvelope<{ requestId: string; doctorUserId?: string }>,
  ): NotificationIntent | null {
    const p = event.payload;
    if (!p.doctorUserId) return null;
    return intent(
      event,
      [
        staffDurable(event, {
          userId: p.doctorUserId,
          type: 'radiology.report_ready',
          title: 'Radiology report ready',
          body: 'A radiology report is ready for review.',
          entityType: 'radiology_request',
          entityId: p.requestId,
          actionPath: '/radiology',
        }),
      ],
      [
        {
          name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
          jobId: `ws:rad-ready:${p.requestId}`,
          data: {
            eventId: event.id,
            type: 'radiology.report_ready',
            userId: p.doctorUserId,
            payload: { requestId: p.requestId },
            dedupeKey: `ws:rad-ready:${event.id}`,
          },
        },
        {
          name: NOTIFICATION_JOBS.SEND_FCM,
          jobId: `fcm:rad-ready:${p.requestId}`,
          data: {
            eventId: event.id,
            templateKey: 'radiology.report_ready.doctor.push',
            userId: p.doctorUserId,
            variables: { requestId: p.requestId },
            dedupeKey: `fcm:rad-ready:${event.id}`,
          },
        },
      ],
    );
  }

  private onRadiologyRequestCreated(
    event: DomainEventEnvelope<{
      requestId: string;
      radiologistUserIds?: string[];
    }>,
  ): NotificationIntent {
    const p = event.payload;
    const durable: DurableNotificationSpec[] = [];
    const jobs: QueuedNotificationJob[] = [
      {
        name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
        jobId: `ws:rad-queue:${p.requestId}`,
        data: {
          eventId: event.id,
          type: 'radiology.request_created',
          room: 'radiology',
          payload: { requestId: p.requestId },
          dedupeKey: `ws:rad-queue:${event.id}`,
        },
      },
    ];
    for (const userId of p.radiologistUserIds ?? []) {
      durable.push(
        staffDurable(event, {
          userId,
          type: 'radiology.request_created',
          title: 'New radiology request',
          body: 'A new imaging request is in the radiology queue.',
          entityType: 'radiology_request',
          entityId: p.requestId,
          actionPath: '/radiology',
        }),
      );
      jobs.push({
        name: NOTIFICATION_JOBS.SEND_FCM,
        jobId: `fcm:rad-queue:${p.requestId}:${userId}`,
        data: {
          eventId: event.id,
          templateKey: 'radiology.request_created.staff.push',
          userId,
          variables: { requestId: p.requestId },
          dedupeKey: `fcm:rad-queue:${event.id}:${userId}`,
        },
      });
    }
    return intent(event, durable, jobs);
  }

  private onAuthSecurity(
    event: DomainEventEnvelope<{ userId: string }>,
  ): NotificationIntent | null {
    const userId = event.payload.userId;
    if (!userId) return null;
    const isPassword =
      event.type === DOMAIN_EVENT_TYPES.AUTH_PASSWORD_CHANGED;
    return intent(
      event,
      [
        staffDurable(event, {
          userId,
          type: event.type,
          title: isPassword ? 'Password changed' : 'Security settings updated',
          body: isPassword
            ? 'Your NyaLife password was changed. If this was not you, contact an administrator.'
            : 'Your account security settings were updated.',
          priority: 'HIGH',
          entityType: 'user',
          entityId: userId,
          actionPath: '/settings',
        }),
      ],
      [
        {
          name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
          jobId: `ws:auth-security:${event.id}`,
          data: {
            eventId: event.id,
            type: event.type,
            userId,
            payload: {},
            dedupeKey: `ws:auth-security:${event.id}`,
          },
        },
      ],
    );
  }

  private onInsuranceClaimDenied(
    event: DomainEventEnvelope<{
      patientId?: string;
      claimId?: string;
      claimNumber?: string;
    }>,
  ): NotificationIntent | null {
    const sms = this.patientSms(
      event,
      'insurance_claim.denied.patient.sms',
      event.payload,
      event.payload as Record<string, unknown>,
    );
    const jobs = [...(sms?.jobs ?? [])];
    jobs.push({
      name: NOTIFICATION_JOBS.SEND_WEBSOCKET,
      jobId: `ws:claim-denied:${event.payload.claimId ?? event.id}`,
      data: {
        eventId: event.id,
        type: 'insurance_claim.denied',
        room: 'billing',
        payload: {
          claimId: event.payload.claimId,
          claimNumber: event.payload.claimNumber,
        },
        dedupeKey: `ws:claim-denied:${event.id}`,
      },
    });
    if (!jobs.length) return null;
    return intent(event, [], jobs);
  }
}
