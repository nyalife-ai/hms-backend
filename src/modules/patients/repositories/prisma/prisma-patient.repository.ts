/**
 * File: prisma-patient.repository.ts
 * Prisma adapter for patients.patients — avoids N+1 via include/select.
 */

import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '../../../../generated/prisma';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  CreatePatientDto,
  PatientsQueryDto,
  UpdatePatientDto,
} from '../../dto';
import { Patient } from '../../domain/patient.entity';
import type {
  IPatientRepository,
  PatientPage,
} from '../../interfaces/patient-repository.interface';

type PatientRow = Prisma.PatientsGetPayload<{
  include: {
    user: { include: { core_profiles_user_id: true } };
  };
}>;

@Injectable()
export class PrismaPatientRepository implements IPatientRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Patient): Promise<Patient> {
    const existing = await this.prisma.patients.findFirst({
      where: { id: entity.getId(), deleted_at: null },
    });
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.patients.update({
          where: { id: entity.getId() },
          data: {
            blood_group: entity.getBloodGroup() ?? null,
            allergies: entity.getAllergies() ?? null,
            chronic_diseases: entity.getChronicDiseases() ?? null,
            occupation: entity.getOccupation() ?? null,
            marital_status: entity.getMaritalStatus() ?? null,
          },
        }),
        this.prisma.profiles.update({
          where: { user_id: entity.getUserId() },
          data: {
            first_name: entity.getFirstName(),
            last_name: entity.getLastName(),
            phone: entity.getPhone() ?? null,
          },
        }),
      ]);
      const refreshed = await this.findById(entity.getId());
      if (!refreshed) throw new Error('Patient missing after update');
      return refreshed;
    }
    throw new Error('Use createFromDto for new patients');
  }

  /** Atomic create: User + Profile + Patient (db.sql relationships). */
  public async createFromDto(dto: CreatePatientDto): Promise<Patient> {
    const count = await this.prisma.patients.count();
    const patientNumber =
      dto.patientNumber ??
      `MRN-${String(10000 + count + 1).padStart(5, '0')}`;

    const email = dto.email?.trim() || null;
    if (email) {
      const emailTaken = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, deleted_at: null },
        select: { id: true },
      });
      if (emailTaken) {
        throw new ConflictException(
          `A user with email ${email} already exists. Use a different email or look up the existing patient.`,
        );
      }
    }

    const passwordHash = await bcrypt.hash('nyalife123', 10);
    const gender = dto.gender ?? null;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            password_hash: passwordHash,
            is_active: true,
            email_verified_at: email ? new Date() : null,
          },
        });
        await tx.profiles.create({
          data: {
            user_id: user.id,
            first_name: dto.firstName,
            last_name: dto.lastName,
            gender,
            phone: dto.phone ?? null,
            date_of_birth: dto.dateOfBirth
              ? new Date(dto.dateOfBirth)
              : null,
            address: dto.address?.trim() || null,
            city: dto.city?.trim() || null,
            country: dto.country?.trim() || null,
            postal_code: dto.postalCode?.trim() || null,
          },
        });
        const patient = await tx.patients.create({
          data: {
            user_id: user.id,
            patient_number: patientNumber,
            blood_group: dto.bloodGroup ?? null,
            allergies: dto.allergies ?? null,
            chronic_diseases: dto.chronicDiseases ?? null,
            occupation: dto.occupation ?? null,
            marital_status: dto.maritalStatus ?? null,
          },
          include: {
            user: { include: { core_profiles_user_id: true } },
          },
        });

        const kinName = dto.emergencyContactName?.trim();
        const kinPhone = dto.emergencyContactPhone?.trim();
        if (kinName || kinPhone) {
          await tx.emergencyContacts.create({
            data: {
              patient_id: patient.id,
              name: kinName || 'Next of kin',
              phone: kinPhone || '—',
              relationship: 'NEXT_OF_KIN',
              is_primary: true,
            },
          });
        }

        return patient;
      });

      return this.toDomain(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = Array.isArray(err.meta?.target)
          ? (err.meta?.target as string[]).join(', ')
          : String(err.meta?.target ?? 'unique field');
        throw new ConflictException(
          `Patient could not be created — ${target} is already in use.`,
        );
      }
      throw err;
    }
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Patient | null> {
    const row = await this.prisma.patients.findFirst({
      where: { id, deleted_at: null },
      include: {
        user: { include: { core_profiles_user_id: true } },
      },
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Patient[]> {
    const rows = await this.prisma.patients.findMany({
      where: { deleted_at: null },
      take: 100,
      include: {
        user: { include: { core_profiles_user_id: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    const n = await this.prisma.patients.count({
      where: { id, deleted_at: null },
    });
    return n > 0;
  }

  public async findMany(query: PatientsQueryDto): Promise<PatientPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'created_at';
    const sortOrder = query.sortOrder ?? 'desc';

    let genderDb: string | undefined;
    if (query.gender) {
      const g = query.gender.toUpperCase();
      if (g === 'MALE' || g === 'FEMALE' || g === 'OTHER') genderDb = g;
      else if (query.gender === 'Male') genderDb = 'MALE';
      else if (query.gender === 'Female') genderDb = 'FEMALE';
      else if (query.gender === 'Other') genderDb = 'OTHER';
    }

    const status = query.status?.trim().toUpperCase();

    const where: Prisma.PatientsWhereInput = {
      deleted_at: null,
      ...(query.bloodGroup ? { blood_group: query.bloodGroup } : {}),
      ...(query.maritalStatus ? { marital_status: query.maritalStatus } : {}),
      ...(genderDb
        ? { user: { core_profiles_user_id: { some: { gender: genderDb } } } }
        : {}),
      ...(status === 'ADMITTED'
        ? { inpatient_admissions_patient_id: { some: { status: 'ADMITTED' } } }
        : status === 'ACTIVE'
          ? {
              inpatient_admissions_patient_id: {
                none: { status: 'ADMITTED' },
              },
            }
          : {}),
      ...(query.search
        ? {
            OR: [
              {
                patient_number: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                user: {
                  core_profiles_user_id: {
                    some: {
                      OR: [
                        {
                          first_name: {
                            contains: query.search,
                            mode: 'insensitive',
                          },
                        },
                        {
                          last_name: {
                            contains: query.search,
                            mode: 'insensitive',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.patients.count({ where }),
      this.prisma.patients.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: { include: { core_profiles_user_id: true } },
        },
      }),
    ]);

    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.patients.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  public async applyUpdate(
    id: string,
    dto: UpdatePatientDto,
  ): Promise<Patient | null> {
    const current = await this.findById(id);
    if (!current) return null;
    current.update({
      firstName: dto.firstName ?? current.getFirstName(),
      lastName: dto.lastName ?? current.getLastName(),
      phone: dto.phone ?? current.getPhone(),
      bloodGroup: dto.bloodGroup ?? current.getBloodGroup(),
      allergies: dto.allergies ?? current.getAllergies(),
      chronicDiseases: dto.chronicDiseases ?? current.getChronicDiseases(),
      occupation: dto.occupation ?? current.getOccupation(),
      maritalStatus: dto.maritalStatus ?? current.getMaritalStatus(),
    });
    return this.save(current);
  }

  protected toDomain(row: PatientRow): Patient {
    const profile = row.user.core_profiles_user_id[0];
    return Patient.reconstitute(
      row.id,
      {
        userId: row.user_id,
        patientNumber: row.patient_number,
        firstName: profile?.first_name ?? '',
        lastName: profile?.last_name ?? '',
        bloodGroup: row.blood_group,
        allergies: row.allergies,
        chronicDiseases: row.chronic_diseases,
        occupation: row.occupation,
        maritalStatus: row.marital_status,
        phone: profile?.phone,
        email: row.user.email ?? null,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
