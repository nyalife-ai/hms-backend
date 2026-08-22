/**
 * Provider tokens, queue names, and notification event constants.
 */

export const NOTIFICATIONS_REPOSITORY = Symbol('NOTIFICATIONS_REPOSITORY');
export const NOTIFICATIONS_SERVICE = Symbol('NOTIFICATIONS_SERVICE');
export const NOTIFICATIONS_SMS_PROVIDER = Symbol('NOTIFICATIONS_SMS_PROVIDER');

export const NOTIFICATIONS_QUEUE = {
  NAME: 'notifications-queue',
  PROCESSORS: {
    PROCESS: 'process-notifications',
  },
} as const;

export const PAYMENTS_QUEUE = {
  NAME: 'payments-queue',
} as const;

export const NOTIFICATIONS_EVENTS = {
  CREATED: 'notifications.created',
  UPDATED: 'notifications.updated',
  DELETED: 'notifications.deleted',
  SMS_SENT: 'notifications.sms.sent',
} as const;
