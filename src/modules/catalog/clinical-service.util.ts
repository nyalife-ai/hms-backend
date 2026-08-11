/** Shared helpers for clinical billable services (procedures / surgeries). */

export const SYSTEM_FEE_CODES = new Set([
  'CONSULT',
  'LAB',
  'MED',
  'RAD',
  'IPD',
]);

export type ClinicalServiceKind = 'service' | 'surgery';

export function isSystemFeeCode(code: string): boolean {
  return SYSTEM_FEE_CODES.has(code.trim().toUpperCase());
}

export function clinicalServiceKind(
  category: string | null | undefined,
): ClinicalServiceKind {
  const c = category?.trim() ?? '';
  if (/surgery|surgeries|operative|caesarean|major\s*procedure/i.test(c)) {
    return 'surgery';
  }
  return 'service';
}
