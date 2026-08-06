/**
 * File: update-department.usecase.ts
 * Module: departments
 * Purpose: Update department.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateDepartmentDto } from '../dto';
import { DepartmentName } from '../domain/value-objects/department-name.vo';
import { DEPARTMENTS_REPOSITORY } from '../constants/departments.constants';
import { Department } from '../domain/department.entity';
import type { IDepartmentRepository } from '../interfaces/department-repository.interface';

@Injectable()
export class UpdateDepartmentUseCase {
  public constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly repository: IDepartmentRepository,
  ) {}

  public async execute(id: string, dto: UpdateDepartmentDto): Promise<Result<Department, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Department', id));
    }
    try {
      const next = Department.reconstitute(
        existing.getId(),
        {
          name: dto.name ? DepartmentName.create(dto.name) : existing.getName(),
          description: dto.description ?? existing.getDescription(),
        },
        existing.getCreatedAt(),
        new Date(),
      );
      const saved = await this.repository.save(next);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
