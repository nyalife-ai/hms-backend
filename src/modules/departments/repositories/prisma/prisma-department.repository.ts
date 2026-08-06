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
import { Department } from '../../domain/department.entity';
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
          description: entity.getDescription() ?? null,
        },
      });
      return this.toDomain(row);
    }
    const code = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'DEPT';
    const row = await this.prisma.departments.create({
      data: {
        name,
        code: `${code}${Date.now().toString(36).slice(-4)}`.slice(0, 10),
        type: 'CLINICAL',
        description: entity.getDescription() ?? null,
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
    description: string | null;
    created_at: Date;
    updated_at: Date;
  }): Department {
    return Department.reconstitute(
      row.id,
      {
        name: DepartmentName.create(row.name),
        description: row.description ?? undefined,
      },
      row.created_at,
      row.updated_at,
    );
  }
}
