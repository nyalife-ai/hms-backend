/**
 * Mirror of hms-ui/src/lib/roles.ts canAccess rules (account vs settings).
 * Keep in sync when changing frontend MODULE_ACCESS / canAccess.
 */

export type Role =
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'RECEPTIONIST'
  | 'PHARMACIST'
  | 'LAB_TECHNICIAN'
  | 'RADIOLOGIST'
  | 'ACCOUNTANT';

export const ALL_ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'ACCOUNTANT',
];

export const MODULE_ACCESS: Record<string, Role[]> = {
  settings: ['SUPER_ADMIN', 'ADMIN'],
  account: ALL_ROLES,
  dashboard: ALL_ROLES,
};

export function canAccess(
  role: Role,
  module: keyof typeof MODULE_ACCESS,
  permissions?: string[],
): boolean {
  if (role === 'SUPER_ADMIN') {
    return true;
  }
  if (!(MODULE_ACCESS[module]?.includes(role) ?? false)) {
    return false;
  }
  if (module === 'account') {
    return true;
  }
  if (!permissions?.length) {
    return true;
  }
  return (
    permissions.includes('*') || permissions.includes(`module:${module}`)
  );
}
