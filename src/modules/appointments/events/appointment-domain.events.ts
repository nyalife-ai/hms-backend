/**
 * Appointment domain milestone event names (ID-centric payloads).
 * Prefer these over CRUD appointments.updated noise for notifications.
 */

export const APPOINTMENT_DOMAIN_EVENTS = {
  CREATED: 'appointment.created',
  CHECKED_IN: 'appointment.checked_in',
  CANCELLED: 'appointment.cancelled',
  RESCHEDULED: 'appointment.rescheduled',
} as const;

export type AppointmentCreatedPayload = {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  doctorUserId?: string;
};

export type AppointmentCancelledPayload = {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentDate?: string;
};

export type AppointmentRescheduledPayload = AppointmentCreatedPayload;

export type AppointmentCheckedInPayload = {
  appointmentId: string;
  patientId: string;
  doctorId: string;
};
