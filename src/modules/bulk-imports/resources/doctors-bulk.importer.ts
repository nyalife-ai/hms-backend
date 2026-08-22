/**
 * Doctors / clinical staff bulk importer.
 * Headers first line; no passwords; email unique; department by name or code.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import type {
  BulkImportCommitResult,
  BulkImportNormalizedRow,
  BulkImportResource,
  BulkImportRowIssue,
  BulkImportValidateResult,
} from './bulk-import-resource';
import { cell, rowsToCsv } from './csv-utils';
import { isValidEmail, isValidPhone } from './patient-csv.contract';

const HEADERS = [
  'First Name',
  'Last Name',
  'Email',
  'Role',
  'Phone',
  'Department Code',
  'Department Name',
  'Specialty',
] as const;

const ALLOWED_ROLES = [
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'ACCOUNTANT',
  'ADMIN',
] as const;

@Injectable()
export class DoctorsBulkImporter implements BulkImportResource {
  public readonly resourceKey = 'doctors';
  public readonly displayName = 'Doctors / Staff';
  public readonly headers = HEADERS;
  public readonly requiredHeaders = [
    'First Name',
    'Last Name',
    'Email',
    'Role',
  ] as const;

  private readonly logger = new Logger(DoctorsBulkImporter.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
  ) {}

  public buildTemplateCsv(): string {
    return rowsToCsv(HEADERS, []);
  }

  public buildExampleCsv(): string {
    return rowsToCsv(HEADERS, [
      [
        'Amina',
        'Okello',
        'amina.okello@nyalife.local',
        'DOCTOR',
        '+254700100200',
        '',
        'Outpatient',
        'General Practice',
      ],
      [
        'James',
        'Mwangi',
        'james.mwangi@nyalife.local',
        'NURSE',
        '+254700100201',
        '',
        'Outpatient',
        '',
      ],
    ]);
  }

  public async validate(
    rawRows: Array<{ index: number; values: Record<string, string> }>,
  ): Promise<BulkImportValidateResult> {
    const errors: BulkImportRowIssue[] = [];
    const warnings: BulkImportRowIssue[] = [];
    const valid: BulkImportNormalizedRow[] = [];
    const seenEmail = new Map<string, number>();

    const emails = rawRows
      .map((r) => cell(r.values, 'Email').toLowerCase())
      .filter(Boolean);
    const existing = emails.length
      ? await this.prisma.user.findMany({
          where: {
            deleted_at: null,
            email: { in: [...new Set(emails)], mode: 'insensitive' },
          },
          select: { email: true },
        })
      : [];
    const emailSet = new Set(
      existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[],
    );

    const depts = await this.prisma.departments.findMany({
      where: { is_active: true },
      select: { id: true, name: true, code: true },
    });
    const byCode = new Map(depts.map((d) => [d.code.toUpperCase(), d]));
    const byName = new Map(depts.map((d) => [d.name.toLowerCase(), d]));

    for (const raw of rawRows) {
      const rowNum = raw.index + 1;
      const rowErrors: BulkImportRowIssue[] = [];
      const firstName = cell(raw.values, 'First Name');
      const lastName = cell(raw.values, 'Last Name');
      const email = cell(raw.values, 'Email').toLowerCase();
      const role = cell(raw.values, 'Role').toUpperCase();
      const phone = cell(raw.values, 'Phone');
      const deptCode = cell(raw.values, 'Department Code').toUpperCase();
      const deptName = cell(raw.values, 'Department Name');
      const specialty = cell(raw.values, 'Specialty');

      if (!firstName)
        rowErrors.push({
          row: rowNum,
          message: 'First name is required.',
          field: 'First Name',
        });
      if (!lastName)
        rowErrors.push({
          row: rowNum,
          message: 'Last name is required.',
          field: 'Last Name',
        });
      if (!email) {
        rowErrors.push({
          row: rowNum,
          message: 'Email is required.',
          field: 'Email',
        });
      } else if (!isValidEmail(email)) {
        rowErrors.push({
          row: rowNum,
          message: 'Email address is invalid.',
          field: 'Email',
          value: email,
        });
      } else if (seenEmail.has(email)) {
        rowErrors.push({
          row: rowNum,
          message: `Email is duplicated in this file (also on row ${seenEmail.get(email)}).`,
          field: 'Email',
          value: email,
        });
      } else if (emailSet.has(email)) {
        rowErrors.push({
          row: rowNum,
          message: `Email "${email}" already exists.`,
          field: 'Email',
          value: email,
        });
      } else {
        seenEmail.set(email, rowNum);
      }

      if (!role) {
        rowErrors.push({
          row: rowNum,
          message: 'Role is required.',
          field: 'Role',
        });
      } else if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
        rowErrors.push({
          row: rowNum,
          message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}.`,
          field: 'Role',
          value: role,
        });
      }

      if (phone && !isValidPhone(phone)) {
        rowErrors.push({
          row: rowNum,
          message: 'Phone number is invalid.',
          field: 'Phone',
          value: phone,
        });
      }

      let departmentId: string | undefined;
      if (deptCode) {
        const d = byCode.get(deptCode);
        if (!d) {
          rowErrors.push({
            row: rowNum,
            message: `Department code "${deptCode}" does not exist.`,
            field: 'Department Code',
            value: deptCode,
          });
        } else departmentId = d.id;
      } else if (deptName) {
        const d = byName.get(deptName.toLowerCase());
        if (!d) {
          rowErrors.push({
            row: rowNum,
            message: `Department "${deptName}" does not exist.`,
            field: 'Department Name',
            value: deptName,
          });
        } else departmentId = d.id;
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        firstName,
        lastName,
        email,
        role,
        phone: phone || undefined,
        departmentId,
        specialty: specialty || undefined,
        asDoctor: role === 'DOCTOR' ? 'true' : 'false',
        _row: String(rowNum),
      });
    }

    return {
      totalRows: rawRows.length,
      validRows: valid.length,
      invalidRows: rawRows.length - valid.length,
      warningRows: 0,
      errors,
      warnings,
      rows: valid,
      previewSample: valid.slice(0, 5).map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        role: r.role,
      })),
    };
  }

  public async commit(
    rows: BulkImportNormalizedRow[],
    actorUserId: string,
  ): Promise<BulkImportCommitResult> {
    const errors: BulkImportRowIssue[] = [];
    const createdIds: string[] = [];
    let imported = 0;
    let failed = 0;
    const passwordHash = await bcrypt.hash('nyalife123', 10);

    for (const row of rows) {
      const rowNum = Number(row._row ?? 0);
      try {
        const role = await this.prisma.roles.findUnique({
          where: { name: row.role! },
        });
        if (!role) throw new Error(`Unknown role ${row.role}`);

        const staff = await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email: row.email!,
              password_hash: passwordHash,
              is_active: true,
              email_verified_at: new Date(),
            },
          });
          await tx.profiles.create({
            data: {
              user_id: user.id,
              first_name: row.firstName!,
              last_name: row.lastName!,
              phone: row.phone || null,
            },
          });
          await tx.userRoles.create({
            data: { user_id: user.id, role_id: role.id },
          });
          const staffCount = await tx.staffProfiles.count();
          return tx.staffProfiles.create({
            data: {
              user_id: user.id,
              employee_id: `EMP-${String(100 + staffCount + 1).padStart(3, '0')}`,
              department_id: row.departmentId || null,
              specialization:
                row.specialty ||
                (row.asDoctor === 'true' ? row.role! : null),
              position: row.asDoctor === 'true' ? 'Doctor' : row.role!,
              join_date: new Date(),
              is_active: true,
            },
          });
        });
        createdIds.push(staff.id);
        imported += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          row: rowNum,
          message: `Could not create staff: ${message}`,
          value: row.email,
        });
        this.logger.warn(`Doctor import row ${rowNum}: ${message}`);
      }
    }

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'CREATE',
      entityType: 'bulk-import.doctors',
      entityId: createdIds[0] ?? 'none',
      newValues: { imported, failed, total: rows.length },
    });

    return { imported, failed, skipped: 0, errors, createdIds };
  }
}
