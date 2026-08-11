/**
 * Seed HMS roles, permissions, demo staff, insurance providers, and catalog.
 * Run after migrations: npm run prisma:seed
 */
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma';
import {
  MODULE_PERMISSIONS,
  ROLE_MODULE_ACCESS,
  modulePermission,
} from '../src/modules/auth/auth.permissions';
import type { HmsRole } from '../src/modules/auth/auth.types';
import { seedCatalog } from './seed-catalog';
import { seedLabCatalog } from './seed-lab-catalog';
import { seedOps } from './seed-ops';

const prisma = new PrismaClient();

const ROLES = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full-access testing / QA (all modules)',
    is_system: true,
  },
  { name: 'ADMIN', description: 'System administrator', is_system: true },
  { name: 'DOCTOR', description: 'Physician', is_system: true },
  { name: 'NURSE', description: 'Nursing staff', is_system: true },
  { name: 'RECEPTIONIST', description: 'Front desk', is_system: true },
  { name: 'PHARMACIST', description: 'Pharmacy', is_system: true },
  { name: 'LAB_TECHNICIAN', description: 'Laboratory', is_system: true },
  { name: 'RADIOLOGIST', description: 'Radiology', is_system: true },
  { name: 'ACCOUNTANT', description: 'Billing / finance', is_system: true },
  { name: 'PATIENT', description: 'Patient portal self-service', is_system: true },
] as const;

const DEMO_USERS = [
  {
    email: 'super@nyalife.health',
    first_name: 'NyaLife',
    last_name: 'Super',
    role: 'SUPER_ADMIN' as HmsRole,
    employee_id: 'EMP-000',
    position: 'Full-access tester',
  },
  { email: 'admin@nyalife.health', first_name: 'Terrine', last_name: 'Herman', role: 'ADMIN' as HmsRole, employee_id: 'EMP-001', position: 'System Administrator' },
  { email: 'a.okello@nyalife.health', first_name: 'Amina', last_name: 'Okello', role: 'DOCTOR' as HmsRole, employee_id: 'EMP-014', position: 'General Physician', specialization: 'General Medicine' },
  { email: 'g.wanjiru@nyalife.health', first_name: 'Grace', last_name: 'Wanjiru', role: 'NURSE' as HmsRole, employee_id: 'EMP-027', position: 'Head Nurse, Ward A' },
  { email: 'b.otieno@nyalife.health', first_name: 'Brian', last_name: 'Otieno', role: 'RECEPTIONIST' as HmsRole, employee_id: 'EMP-068', position: 'Front Desk' },
  { email: 'f.njeri@nyalife.health', first_name: 'Faith', last_name: 'Njeri', role: 'PHARMACIST' as HmsRole, employee_id: 'EMP-031', position: 'Chief Pharmacist' },
  { email: 's.kiptoo@nyalife.health', first_name: 'Samuel', last_name: 'Kiptoo', role: 'LAB_TECHNICIAN' as HmsRole, employee_id: 'EMP-044', position: 'Senior Lab Tech' },
  { email: 'm.achieng@nyalife.health', first_name: 'Mercy', last_name: 'Achieng', role: 'RADIOLOGIST' as HmsRole, employee_id: 'EMP-052', position: 'Radiology Lead', specialization: 'Radiology' },
  { email: 'p.mwangi@nyalife.health', first_name: 'Peter', last_name: 'Mwangi', role: 'ACCOUNTANT' as HmsRole, employee_id: 'EMP-060', position: 'Finance Officer' },
];

const INSURERS = [
  { name: 'SHA (Social Health Authority)', code: 'SHA', claim_submission_method: 'API' },
  { name: 'Jubilee Health', code: 'JUBILEE', claim_submission_method: 'API' },
  { name: 'AAR Insurance', code: 'AAR', claim_submission_method: 'API' },
  { name: 'Britam Health', code: 'BRITAM', claim_submission_method: 'MANUAL' },
  { name: 'Madison Insurance', code: 'MADISON', claim_submission_method: 'MANUAL' },
] as const;

async function main() {
  const passwordHash = await bcrypt.hash('nyalife123', 10);

  for (const role of ROLES) {
    await prisma.roles.upsert({
      where: { name: role.name },
      create: { ...role },
      update: { description: role.description, is_system: role.is_system },
    });
  }

  for (const module of MODULE_PERMISSIONS) {
    const name = modulePermission(module);
    await prisma.permissions.upsert({
      where: { name },
      create: {
        name,
        module,
        description: `Access ${module} module`,
      },
      update: {
        module,
        description: `Access ${module} module`,
      },
    });
  }

  const roleByName = Object.fromEntries(
    (await prisma.roles.findMany()).map((r) => [r.name, r]),
  );
  const permissionByName = Object.fromEntries(
    (await prisma.permissions.findMany()).map((p) => [p.name, p]),
  );

  for (const [roleName, modules] of Object.entries(ROLE_MODULE_ACCESS)) {
    const role = roleByName[roleName];
    if (!role) continue;
    const allowedIds: string[] = [];
    for (const module of modules) {
      const permission = permissionByName[modulePermission(module)];
      if (!permission) continue;
      allowedIds.push(permission.id);
      await prisma.rolePermissions.upsert({
        where: {
          role_id_permission_id: {
            role_id: role.id,
            permission_id: permission.id,
          },
        },
        create: {
          role_id: role.id,
          permission_id: permission.id,
        },
        update: {},
      });
    }
    if (allowedIds.length > 0) {
      await prisma.rolePermissions.deleteMany({
        where: {
          role_id: role.id,
          permission_id: { notIn: allowedIds },
        },
      });
    }
  }

  for (const demo of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      create: {
        email: demo.email,
        password_hash: passwordHash,
        is_active: true,
        email_verified_at: new Date(),
      },
      update: { password_hash: passwordHash, is_active: true },
    });

    await prisma.profiles.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        first_name: demo.first_name,
        last_name: demo.last_name,
      },
      update: {
        first_name: demo.first_name,
        last_name: demo.last_name,
      },
    });

    await prisma.staffProfiles.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        employee_id: demo.employee_id,
        position: demo.position,
        specialization: 'specialization' in demo ? demo.specialization : null,
        join_date: new Date('2020-01-15'),
        is_active: true,
      },
      update: {
        position: demo.position,
        specialization: 'specialization' in demo ? demo.specialization : null,
        is_active: true,
      },
    });

    const role = roleByName[demo.role];
    if (role) {
      await prisma.userRoles.upsert({
        where: {
          user_id_role_id: { user_id: user.id, role_id: role.id },
        },
        create: { user_id: user.id, role_id: role.id },
        update: {},
      });
    }
  }

  for (const insurer of INSURERS) {
    await prisma.insuranceProviders.upsert({
      where: { code: insurer.code },
      create: { ...insurer, is_active: true },
      update: {
        name: insurer.name,
        claim_submission_method: insurer.claim_submission_method,
        is_active: true,
      },
    });
  }

  await seedCatalog(prisma);
  await seedLabCatalog(prisma);
  await seedOps(prisma);

  console.log('Seed complete:');
  console.log(`  ${ROLES.length} roles`);
  console.log(`  ${MODULE_PERMISSIONS.length} module permissions`);
  console.log(`  ${DEMO_USERS.length} demo users (password: nyalife123)`);
  console.log(`  ${INSURERS.length} insurance providers`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
