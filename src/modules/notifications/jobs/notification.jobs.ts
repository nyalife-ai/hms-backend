/**
 * Bull job contracts for the notifications (+ payments) queues.
 */

export const NOTIFICATION_JOBS = {
  SEND_SMS: 'notification.send_sms',
  SEND_EMAIL: 'notification.send_email',
  SEND_FCM: 'notification.send_fcm',
  SEND_WEBSOCKET: 'notification.send_websocket',
  APPOINTMENT_REMINDER: 'notification.appointment_reminder',
} as const;

export const PAYMENT_JOBS = {
  STK_PUSH: 'payment.stk_push',
} as const;

export const PAYMENTS_QUEUE_NAME =
  process.env.BULL_PAYMENTS_QUEUE?.trim() || 'nyalife-payments';

/** Durable in-app notification to persist before channel delivery. */
export type DurableNotificationSpec = {
  readonly userId: string;
  readonly notificationType: string;
  readonly title: string;
  readonly body: string;
  readonly priority?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly actionPath?: string;
  /** Stable: eventId:userId:notificationType */
  readonly idempotencyKey: string;
};

export type SmsJobData = {
  readonly eventId: string;
  readonly templateKey: string;
  readonly patientId?: string;
  readonly userId?: string;
  readonly variables?: Record<string, string>;
  readonly dedupeKey: string;
  readonly notificationId?: string;
};

export type EmailJobData = {
  readonly eventId: string;
  readonly templateKey: string;
  readonly userId: string;
  readonly variables?: Record<string, string>;
  readonly dedupeKey: string;
  readonly notificationId?: string;
};

export type FcmJobData = {
  readonly eventId: string;
  readonly templateKey: string;
  readonly userId: string;
  readonly variables?: Record<string, string>;
  readonly dedupeKey: string;
  readonly notificationId?: string;
};

export type WebsocketJobData = {
  readonly eventId: string;
  readonly type: string;
  readonly room?: string;
  readonly userId?: string;
  readonly payload: Record<string, unknown>;
  readonly dedupeKey: string;
  readonly notificationId?: string;
};

export type AppointmentReminderJobData = {
  readonly eventId: string;
  readonly appointmentId: string;
  readonly expectedStartsAt: string;
  readonly dedupeKey: string;
};

export type StkPushJobData = {
  readonly visitId: string;
  readonly phone: string;
  readonly source: 'RECEPTION' | 'PHARMACY';
  readonly actorUserId: string;
  readonly dedupeKey: string;
};

export type QueuedNotificationJob =
  | {
      name: typeof NOTIFICATION_JOBS.SEND_SMS;
      data: SmsJobData;
      delayMs?: number;
      jobId?: string;
    }
  | {
      name: typeof NOTIFICATION_JOBS.SEND_EMAIL;
      data: EmailJobData;
      delayMs?: number;
      jobId?: string;
    }
  | {
      name: typeof NOTIFICATION_JOBS.SEND_FCM;
      data: FcmJobData;
      delayMs?: number;
      jobId?: string;
    }
  | {
      name: typeof NOTIFICATION_JOBS.SEND_WEBSOCKET;
      data: WebsocketJobData;
      delayMs?: number;
      jobId?: string;
    }
  | {
      name: typeof NOTIFICATION_JOBS.APPOINTMENT_REMINDER;
      data: AppointmentReminderJobData;
      delayMs?: number;
      jobId?: string;
    };

export type NotificationIntent = {
  readonly eventId: string;
  readonly eventType: string;
  /** Persist these rows before enqueueing channel jobs. */
  readonly durable: DurableNotificationSpec[];
  readonly jobs: QueuedNotificationJob[];
};

export function durableKey(
  eventId: string,
  userId: string,
  notificationType: string,
): string {
  return `${eventId}:${userId}:${notificationType}`;
}
