/**
 * File: soft-delete-staff.usecase.ts
 * Module: staff
 * Purpose: Soft-delete staff.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { STAFF_REPOSITORY } from '../constants/staff.constants';
import type { IStaffRepository } from '../interfaces/staff-repository.interface';

@Injectable()
export class SoftDeleteStaffUseCase {
  public constructor(
    @Inject(STAFF_REPOSITORY) private readonly repository: IStaffRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Staff', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
