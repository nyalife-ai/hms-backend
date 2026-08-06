/**
 * File: find-all-departments.usecase.ts
 * Module: departments
 * Purpose: Paginated list of departments.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { DepartmentsQueryDto } from '../dto';
import { DEPARTMENTS_REPOSITORY } from '../constants/departments.constants';
import type { IDepartmentRepository, DepartmentPage } from '../interfaces/department-repository.interface';

@Injectable()
export class FindAllDepartmentsUseCase {
  public constructor(
    @Inject(DEPARTMENTS_REPOSITORY) private readonly repository: IDepartmentRepository,
  ) {}

  public async execute(query: DepartmentsQueryDto): Promise<Result<DepartmentPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
