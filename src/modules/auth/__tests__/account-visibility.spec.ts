/**
 * Frontend role access rules for My Account vs Settings.
 * Mirrored from hms-ui/src/lib/roles.ts so CI catches regressions without a FE test runner.
 */

import { ALL_ROLES, canAccess, MODULE_ACCESS } from './roles.mirror';

describe('My Account vs Settings visibility', () => {
  it('exposes account to every staff role in MODULE_ACCESS', () => {
    expect(MODULE_ACCESS.account).toEqual(expect.arrayContaining(ALL_ROLES));
  });

  it('allows My Account even when JWT permissions omit module:account', () => {
    for (const role of ALL_ROLES) {
      if (role === 'SUPER_ADMIN') continue;
      expect(canAccess(role, 'account', ['module:dashboard'])).toBe(true);
      expect(canAccess(role, 'account', [])).toBe(true);
    }
  });

  it('does not grant Settings via the account bypass', () => {
    expect(canAccess('DOCTOR', 'settings', ['module:account'])).toBe(false);
    expect(canAccess('PHARMACIST', 'settings')).toBe(false);
    expect(canAccess('ADMIN', 'settings', ['module:settings'])).toBe(true);
    expect(canAccess('ADMIN', 'settings', ['module:dashboard'])).toBe(false);
  });
});
