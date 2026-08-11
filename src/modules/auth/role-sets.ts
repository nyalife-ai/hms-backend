import type { HmsRole } from './auth.types';

/** Staff who operate the OPD visit board (list/read visits). */
export const VISIT_FLOW_ROLES: HmsRole[] = [
  'ADMIN',
  'RECEPTIONIST',
  'NURSE',
  'DOCTOR',
  'ACCOUNTANT',
  'PHARMACIST',
  'LAB_TECHNICIAN',
];

/** All clinic staff who may use internal messaging. */
export const STAFF_MESSAGE_ROLES: HmsRole[] = [
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'ACCOUNTANT',
];

/** Roles that may read hospital branding (print / receipts). */
export const HOSPITAL_SETTINGS_READ_ROLES: HmsRole[] = [
  'ADMIN',
  'ACCOUNTANT',
  'RECEPTIONIST',
  'DOCTOR',
  'NURSE',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
];

/** Front-desk / schedule operators. */
export const FRONT_DESK_ROLES: HmsRole[] = ['ADMIN', 'RECEPTIONIST'];

/** Clinical schedule viewers (read appointments). */
export const APPOINTMENT_READ_ROLES: HmsRole[] = [
  'ADMIN',
  'RECEPTIONIST',
  'DOCTOR',
  'NURSE',
];
