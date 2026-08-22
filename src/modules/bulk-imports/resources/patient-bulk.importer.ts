/**
 * Patient bulk importer — validate/preview then commit via PatientsService.
 */

import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { HmsAuditWriter } from '../../audit/hms-audit.writer';
import type { CreatePatientDto } from '../../patients/dto';
import { PatientsService } from '../../patients/patients.service';
import type {
  BulkImportCommitResult,
  BulkImportNormalizedRow,
  BulkImportResource,
  BulkImportRowIssue,
  BulkImportValidateResult,
} from './bulk-import-resource';
import {
  BLOOD_GROUPS,
  buildPatientExampleCsv,
  buildPatientTemplateCsv,
  isValidDateOfBirth,
  isValidEmail,
  isValidPhone,
  normalizeGender,
  normalizeMaritalStatus,
  normalizePhoneKey,
  PATIENT_CSV_HEADERS,
  PATIENT_REQUIRED_HEADERS,
} from './patient-csv.contract';

@Injectable()
export class PatientBulkImporter implements BulkImportResource {
  public readonly resourceKey = 'patients';
  public readonly displayName = 'Patients';
  public readonly headers = PATIENT_CSV_HEADERS;
  public readonly requiredHeaders = PATIENT_REQUIRED_HEADERS;

  private readonly logger = new Logger(PatientBulkImporter.name);

  public constructor(
    private readonly patients: PatientsService,
    private readonly prisma: PrismaService,
    private readonly audit: HmsAuditWriter,
  ) {}

  public buildTemplateCsv(): string {
    return buildPatientTemplateCsv();
  }

  public buildExampleCsv(): string {
    return buildPatientExampleCsv();
  }

  public async validate(
    rawRows: Array<{ index: number; values: Record<string, string> }>,
  ): Promise<BulkImportValidateResult> {
    const errors: BulkImportRowIssue[] = [];
    const warnings: BulkImportRowIssue[] = [];
    const valid: BulkImportNormalizedRow[] = [];

    const seenMrn = new Map<string, number>();
    const seenEmail = new Map<string, number>();
    const seenIdentity = new Map<string, number>();

    // Prefetch existing emails / MRNs / phones for this batch
    const emails = rawRows
      .map((r) => r.values['Email']?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e));
    const mrns = rawRows
      .map((r) => r.values['Medical Record Number']?.trim().toUpperCase())
      .filter((m): m is string => Boolean(m));
    const uniquePhones = [
      ...new Set(
        rawRows
          .map((r) => (r.values['Phone'] ?? '').trim())
          .filter(Boolean),
      ),
    ];

    const [existingEmails, existingMrns, existingPhones] = await Promise.all([
      emails.length
        ? this.prisma.user.findMany({
            where: {
              deleted_at: null,
              email: { in: [...new Set(emails)], mode: 'insensitive' },
            },
            select: { email: true },
          })
        : Promise.resolve([] as { email: string | null }[]),
      mrns.length
        ? this.prisma.patients.findMany({
            where: {
              deleted_at: null,
              patient_number: { in: [...new Set(mrns)], mode: 'insensitive' },
            },
            select: { patient_number: true },
          })
        : Promise.resolve([] as { patient_number: string }[]),
      uniquePhones.length
        ? this.prisma.profiles.findMany({
            where: {
              deleted_at: null,
              phone: { in: uniquePhones },
            },
            select: { phone: true },
          })
        : Promise.resolve([] as { phone: string | null }[]),
    ]);

    const emailSet = new Set(
      existingEmails
        .map((e) => e.email?.toLowerCase())
        .filter((e): e is string => Boolean(e)),
    );
    const mrnSet = new Set(
      existingMrns.map((m) => m.patient_number.toUpperCase()),
    );
    const phoneSet = new Set(
      existingPhones
        .map((p) => normalizePhoneKey(p.phone ?? ''))
        .filter((p) => p.length >= 7),
    );

    for (const raw of rawRows) {
      const rowNum = raw.index + 1; // 1-based for humans (data row; header is 0)
      const rowErrors: BulkImportRowIssue[] = [];
      const rowWarnings: BulkImportRowIssue[] = [];
      const v = raw.values;

      const firstName = (v['First Name'] ?? '').trim();
      const lastName = (v['Last Name'] ?? '').trim();
      const genderRaw = (v['Gender'] ?? '').trim();
      const phone = (v['Phone'] ?? '').trim();
      const dob = (v['Date of Birth'] ?? '').trim();
      const email = (v['Email'] ?? '').trim();
      const bloodGroup = (v['Blood Group'] ?? '').trim();
      const marital = (v['Marital Status'] ?? '').trim();
      const occupation = (v['Occupation'] ?? '').trim();
      const allergies = (v['Allergies'] ?? '').trim();
      const chronic = (v['Chronic Conditions'] ?? '').trim();
      const address = (v['Address'] ?? '').trim();
      const city = (v['City'] ?? '').trim();
      const country = (v['Country'] ?? '').trim();
      const postalCode = (v['Postal Code'] ?? '').trim();
      const mrn = (v['Medical Record Number'] ?? '').trim();
      const kinName = (v['Next of Kin Name'] ?? '').trim();
      const kinPhone = (v['Next of Kin Phone'] ?? '').trim();

      if (!firstName) {
        rowErrors.push({
          row: rowNum,
          message: 'First name is required.',
          field: 'First Name',
        });
      }
      if (!lastName) {
        rowErrors.push({
          row: rowNum,
          message: 'Last name is required.',
          field: 'Last Name',
        });
      }
      const gender = normalizeGender(genderRaw);
      if (!genderRaw) {
        rowErrors.push({
          row: rowNum,
          message: 'Gender is required.',
          field: 'Gender',
        });
      } else if (!gender) {
        rowErrors.push({
          row: rowNum,
          message:
            'Gender must be Male, Female, or Other (or MALE / FEMALE / OTHER).',
          field: 'Gender',
          value: genderRaw,
        });
      }
      if (!phone) {
        rowErrors.push({
          row: rowNum,
          message: 'Phone is required.',
          field: 'Phone',
        });
      } else if (!isValidPhone(phone)) {
        rowErrors.push({
          row: rowNum,
          message: 'Phone number is invalid.',
          field: 'Phone',
          value: phone,
        });
      }

      if (dob && !isValidDateOfBirth(dob)) {
        rowErrors.push({
          row: rowNum,
          message: 'Date of birth must be YYYY-MM-DD and a real past date.',
          field: 'Date of Birth',
          value: dob,
        });
      }
      if (email && !isValidEmail(email)) {
        rowErrors.push({
          row: rowNum,
          message: 'Email address is invalid.',
          field: 'Email',
          value: email,
        });
      }
      if (
        bloodGroup &&
        !(BLOOD_GROUPS as readonly string[]).includes(bloodGroup)
      ) {
        rowErrors.push({
          row: rowNum,
          message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}.`,
          field: 'Blood Group',
          value: bloodGroup,
        });
      }
      let maritalNorm: string | undefined;
      if (marital) {
        const m = normalizeMaritalStatus(marital);
        if (!m) {
          rowErrors.push({
            row: rowNum,
            message:
              'Marital status must be SINGLE, MARRIED, DIVORCED, or WIDOWED.',
            field: 'Marital Status',
            value: marital,
          });
        } else {
          maritalNorm = m;
        }
      }
      if (kinPhone && !isValidPhone(kinPhone)) {
        rowErrors.push({
          row: rowNum,
          message: 'Next of kin phone is invalid.',
          field: 'Next of Kin Phone',
          value: kinPhone,
        });
      }

      // Within-CSV duplicates
      if (mrn) {
        const key = mrn.toUpperCase();
        if (seenMrn.has(key)) {
          rowErrors.push({
            row: rowNum,
            message: `Medical Record Number "${mrn}" is duplicated in this file (also on row ${seenMrn.get(key)}).`,
            field: 'Medical Record Number',
            value: mrn,
          });
        } else {
          seenMrn.set(key, rowNum);
        }
        if (mrnSet.has(key)) {
          rowErrors.push({
            row: rowNum,
            message: `Medical Record Number "${mrn}" already exists.`,
            field: 'Medical Record Number',
            value: mrn,
          });
        }
      }
      if (email) {
        const key = email.toLowerCase();
        if (seenEmail.has(key)) {
          rowErrors.push({
            row: rowNum,
            message: `Email "${email}" is duplicated in this file (also on row ${seenEmail.get(key)}).`,
            field: 'Email',
            value: email,
          });
        } else {
          seenEmail.set(key, rowNum);
        }
        if (emailSet.has(key)) {
          rowErrors.push({
            row: rowNum,
            message: `Email "${email}" already exists.`,
            field: 'Email',
            value: email,
          });
        }
      }

      const identityKey = [
        normalizePhoneKey(phone),
        firstName.toLowerCase(),
        lastName.toLowerCase(),
        dob,
      ].join('|');
      if (phone && firstName && lastName) {
        if (seenIdentity.has(identityKey)) {
          rowErrors.push({
            row: rowNum,
            message: `This patient appears twice in the file (same name, phone, and date of birth as row ${seenIdentity.get(identityKey)}).`,
          });
        } else {
          seenIdentity.set(identityKey, rowNum);
        }
      }

      const phoneKey = normalizePhoneKey(phone);
      if (phoneKey && phoneSet.has(phoneKey)) {
        rowWarnings.push({
          row: rowNum,
          message:
            'A patient with this phone number may already exist. Review before confirming.',
          field: 'Phone',
          value: phone,
        });
      }

      if (rowErrors.length) {
        errors.push(...rowErrors);
        continue;
      }

      warnings.push(...rowWarnings);
      valid.push({
        firstName,
        lastName,
        gender: gender!,
        phone,
        dateOfBirth: dob || undefined,
        email: email || undefined,
        bloodGroup: bloodGroup || undefined,
        maritalStatus: maritalNorm,
        occupation: occupation || undefined,
        allergies: allergies || undefined,
        chronicDiseases: chronic || undefined,
        address: address || undefined,
        city: city || undefined,
        country: country || undefined,
        postalCode: postalCode || undefined,
        patientNumber: mrn || undefined,
        emergencyContactName: kinName || undefined,
        emergencyContactPhone: kinPhone || undefined,
        _row: String(rowNum),
      });
    }

    const warningRowNums = new Set(warnings.map((w) => w.row));

    return {
      totalRows: rawRows.length,
      validRows: valid.length,
      invalidRows: rawRows.length - valid.length,
      warningRows: warningRowNums.size,
      errors,
      warnings,
      rows: valid,
      previewSample: valid.slice(0, 5).map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        gender: r.gender,
        phone: r.phone,
        email: r.email,
        patientNumber: r.patientNumber,
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

    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      for (const row of chunk) {
        const rowNum = Number(row._row ?? 0);
        const dto: CreatePatientDto = {
          firstName: row.firstName!,
          lastName: row.lastName!,
          gender: row.gender as 'MALE' | 'FEMALE' | 'OTHER',
          phone: row.phone,
          dateOfBirth: row.dateOfBirth,
          email: row.email,
          bloodGroup: row.bloodGroup as CreatePatientDto['bloodGroup'],
          maritalStatus: row.maritalStatus as CreatePatientDto['maritalStatus'],
          occupation: row.occupation,
          allergies: row.allergies,
          chronicDiseases: row.chronicDiseases,
          address: row.address,
          city: row.city,
          country: row.country,
          postalCode: row.postalCode,
          patientNumber: row.patientNumber,
          emergencyContactName: row.emergencyContactName,
          emergencyContactPhone: row.emergencyContactPhone,
        };

        try {
          const created = await this.createWithMrnRetry(dto);
          createdIds.push(created.id);
          imported += 1;
        } catch (err) {
          failed += 1;
          const message =
            err instanceof ConflictException
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err);
          errors.push({
            row: rowNum,
            message: `Could not create patient: ${message}`,
            value: `${row.firstName} ${row.lastName}`.trim(),
          });
          this.logger.warn(`Patient import row ${rowNum} failed: ${message}`);
        }
      }
    }

    await this.audit.recordMutation({
      userId: actorUserId,
      action: 'CREATE',
      entityType: 'bulk-import.patients',
      entityId: createdIds[0] ?? 'none',
      newValues: {
        imported,
        failed,
        total: rows.length,
      },
    });

    return {
      imported,
      failed,
      skipped: 0,
      errors,
      createdIds,
    };
  }

  private async createWithMrnRetry(
    dto: CreatePatientDto,
    attempts = 3,
  ): Promise<{ id: string }> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        const created = await this.patients.create({
          ...dto,
          // On retry without explicit MRN, leave undefined so repo regenerates
          patientNumber: i === 0 ? dto.patientNumber : dto.patientNumber,
        });
        return { id: created.id };
      } catch (err) {
        lastErr = err;
        const isConflict =
          err instanceof ConflictException ||
          (err instanceof Error && /already in use|already exists/i.test(err.message));
        if (!isConflict || dto.patientNumber) throw err;
        // Race on auto-MRN — retry
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
