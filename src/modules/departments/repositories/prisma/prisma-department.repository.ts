/**
 * Prisma departments repository — core.departments (db.sql).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  CreateDepartmentDto,
  DepartmentsQueryDto,
  UpdateDepartmentDto,
} from '../../dto';
import { Department, type DepartmentType } from '../../domain/department.entity';
import { DepartmentName } from '../../domain/value-objects/department-name.vo';
import type {
  IDepartmentRepository,
  DepartmentPage,
} from '../../interfaces/department-repository.interface';

@Injectable()
export class PrismaDepartmentRepository implements IDepartmentRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: Department): Promise<Department> {
    const name = entity.getName().getValue();
    const existing = await this.prisma.departments.findFirst({
      where: { id: entity.getId() },
    });
    if (existing) {
      const row = await this.prisma.departments.update({
        where: { id: entity.getId() },
        data: {
          name,
          ...(entity.getCode() ? { code: entity.getCode() } : {}),
          ...(entity.getType() ? { type: entity.getType() } : {}),
          description: entity.getDescription() ?? null,
          head_name: entity.getHeadName() ?? null,
          head_position: entity.getHeadPosition() ?? null,
          ...(entity.getIsActive() !== undefined
            ? { is_active: entity.getIsActive() }
            : {}),
        },
      });
      return this.toDomain(row);
    }
    const autoCode = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'DEPT';
    const code =
      entity.getCode()?.toUpperCase().slice(0, 10) ||
      `${autoCode}${Date.now().toString(36).slice(-4)}`.slice(0, 10);
    const row = await this.prisma.departments.create({
      data: {
        name,
        code,
        type: entity.getType() ?? 'CLINICAL',
        description: entity.getDescription() ?? null,
        head_name: entity.getHeadName() ?? null,
        head_position: entity.getHeadPosition() ?? null,
        is_active: entity.getIsActive() ?? true,
      },
    });
    return this.toDomain(row);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.departments.delete({ where: { id } });
  }

  public async findById(id: string): Promise<Department | null> {
    const row = await this.prisma.departments.findFirst({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<Department[]> {
    const rows = await this.prisma.departments.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (
      (await this.prisma.departments.count({ where: { id } })) > 0
    );
  }

  public async findMany(query: DepartmentsQueryDto): Promise<DepartmentPage> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;
    const where = {
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { code: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.departments.count({ where }),
      this.prisma.departments.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
    ]);
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.prisma.departments.update({
      where: { id },
      data: { is_active: false },
    });
  }

  protected toDomain(row: {
    id: string;
    name: string;
    code: string;
    type: string;
    description: string | null;
    head_name: string | null;
    head_position: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
  }): Department {
    return Department.reconstitute(
      row.id,
      {
        name: DepartmentName.create(row.name),
        code: row.code,
        type: row.type as DepartmentType,
        description: row.description ?? undefined,
        headName: row.head_name ?? undefined,
        headPosition: row.head_position ?? undefined,
        isActive: row.is_active,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
