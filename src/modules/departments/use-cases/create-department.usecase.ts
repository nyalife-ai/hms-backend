/**
 * File: create-department.usecase.ts
 * Module: departments
 * Purpose: Create department use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateDepartmentDto } from '../dto';
import { Department } from '../domain/department.entity';
import { DEPARTMENTS_REPOSITORY } from '../constants/departments.constants';
import type { IDepartmentRepository } from '../interfaces/department-repository.interface';

@Injectable()
export class CreateDepartmentUseCase {
  public constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly repository: IDepartmentRepository,
  ) {}

  public async execute(dto: CreateDepartmentDto): Promise<Result<Department, string>> {
    try {
      const entity = Department.create({ name: dto.name, description: dto.description });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
