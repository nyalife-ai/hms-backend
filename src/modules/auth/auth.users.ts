import * as bcrypt from 'bcryptjs';
import type { AuthUser } from './auth.types';

/**
 * Seeded demo accounts for HMS roles. Password for every account: `nyalife123`.
 * Replace with core.users / core.user_roles once the DB schema is wired.
 */
const DEMO_PASSWORD = 'nyalife123';

const SEED: Omit<
  AuthUser,
  'passwordHash' | 'permissions' | 'twoFactorEnabled'
>[] = [
  {
    id: 'u-super',
    name: 'NyaLife Super Admin',
    email: 'super@nyalife.health',
    role: 'SUPER_ADMIN',
    position: 'Full-access tester',
  },
  {
    id: 'u-admin',
    name: 'Terrine Herman',
    email: 'admin@nyalife.health',
    role: 'ADMIN',
    position: 'System Administrator',
  },
  {
    id: 'u-doctor',
    name: 'Dr. Amina Okello',
    email: 'a.okello@nyalife.health',
    role: 'DOCTOR',
    position: 'General Physician',
  },
  {
    id: 'u-nurse',
    name: 'Grace Wanjiru',
    email: 'g.wanjiru@nyalife.health',
    role: 'NURSE',
    position: 'Head Nurse, Ward A',
  },
  {
    id: 'u-reception',
    name: 'Brian Otieno',
    email: 'b.otieno@nyalife.health',
    role: 'RECEPTIONIST',
    position: 'Front Desk',
  },
  {
    id: 'u-pharma',
    name: 'Faith Njeri',
    email: 'f.njeri@nyalife.health',
    role: 'PHARMACIST',
    position: 'Chief Pharmacist',
  },
  {
    id: 'u-lab',
    name: 'Samuel Kiptoo',
    email: 's.kiptoo@nyalife.health',
    role: 'LAB_TECHNICIAN',
    position: 'Senior Lab Tech',
  },
  {
    id: 'u-radio',
    name: 'Dr. Mercy Achieng',
    email: 'm.achieng@nyalife.health',
    role: 'RADIOLOGIST',
    position: 'Radiology Lead',
  },
  {
    id: 'u-accounts',
    name: 'Peter Mwangi',
    email: 'p.mwangi@nyalife.health',
    role: 'ACCOUNTANT',
    position: 'Finance Officer',
  },
];

const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

export const AUTH_USERS: Array<Omit<AuthUser, 'permissions'> & { permissions?: string[] }> =
  SEED.map((user) => ({
    ...user,
    passwordHash,
    twoFactorEnabled: false,
  }));

export const DEMO_PASSWORD_HINT = DEMO_PASSWORD;
