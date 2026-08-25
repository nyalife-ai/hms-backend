/**
 * Auth permission maps and role-set constants.
 */

import {
  MODULE_PERMISSIONS,
  ROLE_MODULE_ACCESS,
  modulePermission,
} from '../auth.permissions';
import {
  APPOINTMENT_READ_ROLES,
  FRONT_DESK_ROLES,
  HOSPITAL_SETTINGS_READ_ROLES,
  STAFF_MESSAGE_ROLES,
  VISIT_FLOW_ROLES,
} from '../role-sets';
import { AUTH_USERS, DEMO_PASSWORD_HINT } from '../auth.users';

describe('auth.permissions', () => {
  it('modulePermission prefixes module keys', () => {
    expect(modulePermission('billing')).toBe('module:billing');
    expect(MODULE_PERMISSIONS).toContain('patients');
  });

  it('ROLE_MODULE_ACCESS covers every role', () => {
    for (const [role, modules] of Object.entries(ROLE_MODULE_ACCESS)) {
      expect(modules.length).toBeGreaterThan(0);
      expect(role).toBeTruthy();
    }
    expect(ROLE_MODULE_ACCESS.SUPER_ADMIN).toEqual(
      expect.arrayContaining([...MODULE_PERMISSIONS]),
    );
    expect(ROLE_MODULE_ACCESS.PATIENT).toContain('patients');
  });

  it('every role can access self-service account module (not settings)', () => {
    expect(MODULE_PERMISSIONS).toContain('account');
    expect(MODULE_PERMISSIONS).toContain('settings');
    for (const [role, modules] of Object.entries(ROLE_MODULE_ACCESS)) {
      expect(modules).toContain('account');
      if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
        expect(modules).toContain('settings');
      } else {
        expect(modules).not.toContain('settings');
      }
    }
  });
});

describe('role-sets', () => {
  it('exposes non-empty role allow-lists', () => {
    expect(VISIT_FLOW_ROLES).toContain('DOCTOR');
    expect(STAFF_MESSAGE_ROLES).toContain('NURSE');
    expect(HOSPITAL_SETTINGS_READ_ROLES).toContain('ADMIN');
    expect(FRONT_DESK_ROLES).toEqual(
      expect.arrayContaining(['ADMIN', 'RECEPTIONIST']),
    );
    expect(APPOINTMENT_READ_ROLES).toContain('RECEPTIONIST');
  });
});

describe('auth.users seed', () => {
  it('seeds demo accounts with hashed passwords', () => {
    expect(DEMO_PASSWORD_HINT).toBeTruthy();
    expect(AUTH_USERS.length).toBeGreaterThan(5);
    for (const u of AUTH_USERS) {
      expect(u.email).toContain('@');
      expect(u.passwordHash.length).toBeGreaterThan(10);
    }
  });
});
