/**
 * Prisma staff repository — core.staff_profiles (db.sql).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { StaffQueryDto } from '../../dto';
import { Staff } from '../../domain/staff.entity';
import { StaffName } from '../../domain/value-objects/staff-name.vo';
import type {
  IStaffRepository,
  StaffPage,
} from '../../interfaces/staff-repository.interface';

const staffInclude = {
  user: { include: { core_profiles_user_id: true } },
} as const;

type StaffRow = {
  id: string;
  user_id: string;
  employee_id: string;
  department_id: string | null;
  position: string | null;
  specialization: string | null;
  qualification: string | null;
  join_date: Date;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  user?: {
    email: string;
    core_profiles_user_id: Array<{
      first_name: string;
      last_name: string;
    }>;
  };
};

@Injectable()
export class PrismaStaffRepository implements IStaffRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Staff): Promise<Staff> {
    const existing = await this.prisma.staffProfiles.findFirst({
      where: { id: entity.getId(), deleted_at: null },
    });

    if (existing) {
      const row = await this.prisma.staffProfiles.update({
        where: { id: entity.getId() },
        data: {
          department_id: entity.getDepartmentId() ?? null,
          position: entity.getPosition() ?? null,
          specialization: entity.getSpecialization() ?? null,
          qualification: entity.getQualification() ?? null,
          join_date: entity.getJoinDate(),
          emergency_contact_name: entity.getEmergencyContactName() ?? null,
          emergency_contact_phone: entity.getEmergencyContactPhone() ?? null,
          is_active: entity.getIsActive(),
        },
        include: staffInclude,
      });
      return this.toDomain(row);
    }

    const row = await this.prisma.staffProfiles.create({
      data: {
        user_id: entity.getUserId(),
        employee_id: entity.getEmployeeId(),
        department_id: entity.getDepartmentId() ?? null,
        position: entity.getPosition() ?? null,
        specialization: entity.getSpecialization() ?? null,
        qualification: entity.getQualification() ?? null,
        join_date: entity.getJoinDate(),
        emergency_contact_name: entity.getEmergencyContactName() ?? null,
        emergency_contact_phone: entity.getEmergencyContactPhone() ?? null,
        is_active: true,
      },
      include: staffInclude,
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  public async findById(id: string): Promise<Staff | null> {
    const row = await this.prisma.staffProfiles.findFirst({
      where: { id, deleted_at: null },
      include: staffInclude,
    });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Staff[]> {
    const rows = await this.prisma.staffProfiles.findMany({
      where: { deleted_at: null, is_active: true },
      include: staffInclude,
      orderBy: { employee_id: 'asc' },
      take: 500,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.staffProfiles.count({
        where: { id, deleted_at: null },
      })) > 0
    );
  }

  public async findMany(query: StaffQueryDto): Promise<StaffPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      deleted_at: null,
      ...(query.search
        ? {
            OR: [
              {
                employee_id: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                position: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                specialization: {
                  contains: query.search,
                  mode: 'insensitive' as const,
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
                            mode: 'insensitive' as const,
                          },
                        },
                        {
                          last_name: {
                            contains: query.search,
                            mode: 'insensitive' as const,
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
      this.prisma.staffProfiles.count({ where }),
      this.prisma.staffProfiles.findMany({
        where,
        skip,
        take: limit,
        include: staffInclude,
        orderBy: { employee_id: 'asc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.staffProfiles.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }

  protected toDomain(row: StaffRow): Staff {
    const profile = row.user?.core_profiles_user_id?.[0];
    const display =
      profile
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : row.user?.email || row.employee_id || 'Staff';
    return Staff.reconstitute(
      row.id,
      {
        name: StaffName.create(display.slice(0, 255) || 'Staff'),
        userId: row.user_id,
        employeeId: row.employee_id,
        joinDate: row.join_date,
        departmentId: row.department_id,
        position: row.position,
        specialization: row.specialization,
        qualification: row.qualification,
        emergencyContactName: row.emergency_contact_name,
        emergencyContactPhone: row.emergency_contact_phone,
        isActive: row.is_active,
        description: undefined,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
