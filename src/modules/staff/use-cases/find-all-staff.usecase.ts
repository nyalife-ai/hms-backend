/**
 * File: find-all-staff.usecase.ts
 * Module: staff
 * Purpose: Paginated list of staff.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { StaffQueryDto } from '../dto';
import { STAFF_REPOSITORY } from '../constants/staff.constants';
import type { IStaffRepository, StaffPage } from '../interfaces/staff-repository.interface';

@Injectable()
export class FindAllStaffUseCase {
  public constructor(
    @Inject(STAFF_REPOSITORY) private readonly repository: IStaffRepository,
  ) {}

  public async execute(query: StaffQueryDto): Promise<Result<StaffPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
