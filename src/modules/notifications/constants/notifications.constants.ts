/**
 * Provider tokens, queue names, and notification event constants.
 */

export const NOTIFICATIONS_REPOSITORY = Symbol('NOTIFICATIONS_REPOSITORY');
export const NOTIFICATIONS_SERVICE = Symbol('NOTIFICATIONS_SERVICE');
export const NOTIFICATIONS_SMS_PROVIDER = Symbol('NOTIFICATIONS_SMS_PROVIDER');

export const NOTIFICATIONS_QUEUE = {
  NAME: process.env.BULL_NOTIFICATIONS_QUEUE?.trim() || 'nyalife-notifications',
  PROCESSORS: {
    PROCESS: 'process-notifications',
  },
} as const;

/** @deprecated Prefer BILLING_PAYMENTS_QUEUE from billing-queue.constants */
export const PAYMENTS_QUEUE = {
  NAME: process.env.BULL_PAYMENTS_QUEUE?.trim() || 'nyalife-payments',
} as const;

export const NOTIFICATIONS_EVENTS = {
  CREATED: 'notifications.created',
  UPDATED: 'notifications.updated',
  DELETED: 'notifications.deleted',
  SMS_SENT: 'notifications.sms.sent',
} as const;
