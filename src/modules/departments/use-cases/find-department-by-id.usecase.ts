/**
 * File: find-department-by-id.usecase.ts
 * Module: departments
 * Purpose: Find department by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { DEPARTMENTS_REPOSITORY } from '../constants/departments.constants';
import type { Department } from '../domain/department.entity';
import type { IDepartmentRepository } from '../interfaces/department-repository.interface';

@Injectable()
export class FindDepartmentByIdUseCase {
  public constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly repository: IDepartmentRepository,
  ) {}

  public async execute(id: string): Promise<Result<Department, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Department', id));
    }
    return Result.success(entity);
  }
}
