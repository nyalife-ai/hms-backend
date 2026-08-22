/**
 * Patient CSV column contract and helpers.
 */

import { rowsToCsv } from './csv-utils';

export { rowsToCsv } from './csv-utils';

export const PATIENT_CSV_HEADERS = [
  'First Name',
  'Last Name',
  'Gender',
  'Phone',
  'Date of Birth',
  'Email',
  'Blood Group',
  'Marital Status',
  'Occupation',
  'Allergies',
  'Chronic Conditions',
  'Address',
  'City',
  'Country',
  'Postal Code',
  'Medical Record Number',
  'Next of Kin Name',
  'Next of Kin Phone',
] as const;

export const PATIENT_REQUIRED_HEADERS = [
  'First Name',
  'Last Name',
  'Gender',
  'Phone',
] as const;

export type PatientCsvHeader = (typeof PATIENT_CSV_HEADERS)[number];

export const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
] as const;

export const MARITAL_STATUSES = [
  'SINGLE',
  'MARRIED',
  'DIVORCED',
  'WIDOWED',
] as const;

export function normalizeGender(
  raw: string,
): 'MALE' | 'FEMALE' | 'OTHER' | null {
  const v = raw.trim().toUpperCase();
  if (v === 'MALE' || v === 'M') return 'MALE';
  if (v === 'FEMALE' || v === 'F') return 'FEMALE';
  if (v === 'OTHER' || v === 'O') return 'OTHER';
  return null;
}

export function normalizeMaritalStatus(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if ((MARITAL_STATUSES as readonly string[]).includes(v)) return v;
  return null;
}

export function isValidDateOfBirth(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return false;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  return d.getTime() <= today.getTime() && d.getFullYear() >= 1900;
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

/** Soft phone check — digits length 7–15 after stripping spaces/dashes. */
export function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/[^\d+]/g, '');
  const onlyDigits = digits.replace(/\D/g, '');
  return onlyDigits.length >= 7 && onlyDigits.length <= 15;
}

export function normalizePhoneKey(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function buildPatientTemplateCsv(): string {
  return rowsToCsv(PATIENT_CSV_HEADERS, []);
}

export function buildPatientExampleCsv(): string {
  return rowsToCsv(PATIENT_CSV_HEADERS, [
    [
      'Amina',
      'Okello',
      'Female',
      '+254712345678',
      '1990-05-12',
      'amina.okello@example.com',
      'O+',
      'MARRIED',
      'Teacher',
      'Penicillin',
      'Asthma',
      '12 Kenyatta Ave',
      'Nairobi',
      'Kenya',
      '00100',
      '',
      'James Okello',
      '+254798765432',
    ],
    [
      'Dennis',
      'Omari',
      'Male',
      '+254700111222',
      '1985-11-03',
      '',
      'A+',
      'SINGLE',
      '',
      '',
      'Hypertension',
      '',
      'Kisumu',
      'Kenya',
      '',
      '',
      'Grace Omari',
      '+254711222333',
    ],
  ]);
}
