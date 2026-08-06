/**
 * File: soft-delete-department.usecase.ts
 * Module: departments
 * Purpose: Soft-delete department.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { DEPARTMENTS_REPOSITORY } from '../constants/departments.constants';
import type { IDepartmentRepository } from '../interfaces/department-repository.interface';

@Injectable()
export class SoftDeleteDepartmentUseCase {
  public constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly repository: IDepartmentRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Department', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
