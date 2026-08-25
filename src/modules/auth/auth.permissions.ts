import type { HmsRole } from './auth.types';

/** Module permission keys — mirror frontend MODULE_ACCESS. */
export const MODULE_PERMISSIONS = [
  'dashboard',
  'front-desk',
  'triage',
  'consultations',
  'patients',
  'appointments',
  'follow-ups',
  'doctors',
  'departments',
  'inpatient',
  'pharmacy',
  'laboratory',
  'radiology',
  'billing',
  'billing-ledger',
  'reports',
  'messages',
  'staff',
  'settings',
  'account',
] as const;

export type ModulePermission = (typeof MODULE_PERMISSIONS)[number];

export function modulePermission(module: ModulePermission): string {
  return `module:${module}`;
}

/**
 * Strict per-desk module access (source of truth for seed + fallback).
 * Each operating role owns one desk; ADMIN is oversight/config only.
 * SUPER_ADMIN gets every module — for QA / full UI testing, not a clinic desk.
 */
export const ROLE_MODULE_ACCESS: Record<HmsRole, ModulePermission[]> = {
  SUPER_ADMIN: [...MODULE_PERMISSIONS],
  ADMIN: [
    'dashboard',
    'front-desk',
    'triage',
    'consultations',
    'patients',
    'appointments',
    'follow-ups',
    'departments',
    'inpatient',
    'pharmacy',
    'laboratory',
    'radiology',
    'billing',
    'billing-ledger',
    'reports',
    'messages',
    'staff',
    'settings',
    'account',
  ],
  DOCTOR: [
    'dashboard',
    'consultations',
    'patients',
    'appointments',
    'follow-ups',
    'inpatient',
    'reports',
    'messages',
    'account',
  ],
  NURSE: [
    'dashboard',
    'triage',
    'patients',
    'appointments',
    'inpatient',
    'reports',
    'messages',
    'account',
  ],
  RECEPTIONIST: [
    'dashboard',
    'front-desk',
    'patients',
    'appointments',
    'follow-ups',
    'doctors',
    'billing',
    'reports',
    'messages',
    'account',
  ],
  PHARMACIST: ['dashboard', 'pharmacy', 'reports', 'messages', 'account'],
  LAB_TECHNICIAN: ['dashboard', 'laboratory', 'reports', 'messages', 'account'],
  RADIOLOGIST: ['dashboard', 'radiology', 'reports', 'messages', 'account'],
  ACCOUNTANT: [
    'dashboard',
    'billing',
    'billing-ledger',
    'reports',
    'messages',
    'account',
  ],
  PATIENT: [
    'dashboard',
    'appointments',
    'patients',
    'billing',
    'pharmacy',
    'laboratory',
    'account',
  ],
};
