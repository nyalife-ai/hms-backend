import type { HmsRole } from './auth.types';

/** Module permission keys — mirror frontend MODULE_ACCESS. */
export const MODULE_PERMISSIONS = [
  'dashboard',
  'front-desk',
  'triage',
  'consultations',
  'patients',
  'appointments',
  'doctors',
  'departments',
  'inpatient',
  'pharmacy',
  'laboratory',
  'radiology',
  'billing',
  'billing-ledger',
  'messages',
  'staff',
  'settings',
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
    'patients',
    'appointments',
    'departments',
    'billing',
    'billing-ledger',
    'messages',
    'staff',
    'settings',
  ],
  DOCTOR: [
    'dashboard',
    'consultations',
    'patients',
    'appointments',
    'inpatient',
    'messages',
  ],
  NURSE: [
    'dashboard',
    'triage',
    'patients',
    'appointments',
    'inpatient',
    'messages',
  ],
  RECEPTIONIST: [
    'dashboard',
    'front-desk',
    'patients',
    'appointments',
    'doctors',
    'billing',
    'messages',
  ],
  PHARMACIST: ['dashboard', 'pharmacy', 'messages'],
  LAB_TECHNICIAN: ['dashboard', 'laboratory', 'messages'],
  RADIOLOGIST: ['dashboard', 'radiology', 'messages'],
  ACCOUNTANT: ['dashboard', 'billing', 'billing-ledger', 'messages'],
  PATIENT: [
    'dashboard',
    'appointments',
    'patients',
    'billing',
    'pharmacy',
    'laboratory',
  ],
};
