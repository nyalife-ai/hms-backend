/**
 * Central notification copy — domain modules must not own channel wording.
 * Uses simple {{var}} interpolation (SMS-safe; no HTML escaping).
 */

export type NotificationTemplateKey =
  | 'notifications.sms.test'
  | 'notifications.email.test'
  | 'message.created.push'
  | 'appointment.created.doctor.push'
  | 'appointment.reminder.patient.sms'
  | 'appointment.cancelled.patient.sms'
  | 'appointment.rescheduled.patient.sms'
  | 'laboratory.request_created.tech.push'
  | 'laboratory.results_ready.doctor.push'
  | 'laboratory.results_critical.doctor.push'
  | 'payment.received.patient.sms'
  | 'payment.failed.patient.sms'
  | 'admission.created.staff.push'
  | 'prescription.dispensed.patient.sms'
  | 'prescription.created.pharmacy.push'
  | 'radiology.request_created.staff.push'
  | 'visit.results_ready.doctor.push'
  | 'visit.ready_for_billing.staff.push'
  | 'visit.completed.patient.sms'
  | 'radiology.report_ready.doctor.push'
  | 'invoice.issued.patient.sms'
  | 'insurance_claim.submitted.patient.sms'
  | 'insurance_claim.approved.patient.sms'
  | 'insurance_claim.denied.patient.sms';

export interface NotificationTemplateDefinition {
  readonly key: NotificationTemplateKey | string;
  readonly channel: 'sms' | 'email' | 'fcm' | 'websocket' | 'in_app';
  readonly subject?: string;
  readonly body: string;
}

const TEMPLATES: readonly NotificationTemplateDefinition[] = [
  {
    key: 'notifications.sms.test',
    channel: 'sms',
    body: 'NyaLife test SMS. Ref {{ref}}.',
  },
  {
    key: 'notifications.email.test',
    channel: 'email',
    subject: 'NyaLife notification',
    body: 'NyaLife email notification. Ref {{ref}}.',
  },
  {
    key: 'message.created.push',
    channel: 'fcm',
    subject: 'New message',
    body: 'You have a new message in NyaLife.',
  },
  {
    key: 'appointment.created.doctor.push',
    channel: 'fcm',
    subject: 'New appointment',
    body: 'A new appointment was scheduled ({{appointmentId}}).',
  },
  {
    key: 'appointment.reminder.patient.sms',
    channel: 'sms',
    body: 'Reminder: you have an appointment at NyaLife on {{appointmentDate}}. Reply if you need to reschedule.',
  },
  {
    key: 'appointment.cancelled.patient.sms',
    channel: 'sms',
    body: 'Your NyaLife appointment on {{appointmentDate}} was cancelled.',
  },
  {
    key: 'appointment.rescheduled.patient.sms',
    channel: 'sms',
    body: 'Your NyaLife appointment was rescheduled to {{appointmentDate}}.',
  },
  {
    key: 'laboratory.request_created.tech.push',
    channel: 'fcm',
    subject: 'New lab request',
    body: 'New laboratory request in queue ({{requestId}}, {{priority}}).',
  },
  {
    key: 'laboratory.results_ready.doctor.push',
    channel: 'fcm',
    subject: 'Lab results ready',
    body: 'Laboratory results are ready for review ({{requestId}}).',
  },
  {
    key: 'laboratory.results_critical.doctor.push',
    channel: 'fcm',
    subject: 'Critical lab result',
    body: 'Critical laboratory result requires attention ({{requestId}}).',
  },
  {
    key: 'payment.received.patient.sms',
    channel: 'sms',
    body: 'Payment received for your NyaLife visit. Thank you.',
  },
  {
    key: 'payment.failed.patient.sms',
    channel: 'sms',
    body: 'Payment for your NyaLife visit did not complete. Please try again at reception.',
  },
  {
    key: 'admission.created.staff.push',
    channel: 'websocket',
    subject: 'Patient admitted',
    body: 'Patient admitted ({{admissionId}}).',
  },
  {
    key: 'prescription.dispensed.patient.sms',
    channel: 'sms',
    body: 'Your medication has been dispensed at NyaLife pharmacy.',
  },
  {
    key: 'prescription.created.pharmacy.push',
    channel: 'fcm',
    subject: 'New prescription',
    body: 'A new prescription is ready for pharmacy ({{prescriptionId}}).',
  },
  {
    key: 'radiology.request_created.staff.push',
    channel: 'fcm',
    subject: 'New radiology request',
    body: 'A new imaging request is in the queue ({{requestId}}).',
  },
  {
    key: 'visit.results_ready.doctor.push',
    channel: 'fcm',
    subject: 'Visit results ready',
    body: 'Clinical results are ready for visit {{visitId}}.',
  },
  {
    key: 'visit.ready_for_billing.staff.push',
    channel: 'websocket',
    subject: 'Ready for billing',
    body: 'Visit {{visitId}} is ready for billing.',
  },
  {
    key: 'visit.completed.patient.sms',
    channel: 'sms',
    body: 'Your NyaLife visit is complete. Thank you for choosing us.',
  },
  {
    key: 'radiology.report_ready.doctor.push',
    channel: 'fcm',
    subject: 'Radiology report ready',
    body: 'Radiology report is ready for review ({{requestId}}).',
  },
  {
    key: 'invoice.issued.patient.sms',
    channel: 'sms',
    body: 'An invoice has been issued for your NyaLife visit ({{invoiceNumber}}).',
  },
  {
    key: 'insurance_claim.submitted.patient.sms',
    channel: 'sms',
    body: 'Your insurance claim {{claimNumber}} was submitted.',
  },
  {
    key: 'insurance_claim.approved.patient.sms',
    channel: 'sms',
    body: 'Your insurance claim {{claimNumber}} was approved.',
  },
  {
    key: 'insurance_claim.denied.patient.sms',
    channel: 'sms',
    body: 'Your insurance claim {{claimNumber}} was denied. Please visit reception.',
  },
];

const BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

export function getNotificationTemplate(
  key: string,
): NotificationTemplateDefinition | undefined {
  return BY_KEY.get(key);
}

/** SMS / plain-text interpolation — does not HTML-escape (unlike email TemplateRenderer). */
export function renderNotificationBody(
  template: string,
  variables: Readonly<Record<string, string | number | boolean | null | undefined>>,
): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return '';
    return String(value);
  });
}


/** @deprecated alias */
export const findNotificationTemplate = getNotificationTemplate;
