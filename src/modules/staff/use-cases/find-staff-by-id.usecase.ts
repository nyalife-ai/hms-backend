/**
 * File: find-staff-by-id.usecase.ts
 * Module: staff
 * Purpose: Find staff by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { STAFF_REPOSITORY } from '../constants/staff.constants';
import type { Staff } from '../domain/staff.entity';
import type { IStaffRepository } from '../interfaces/staff-repository.interface';

@Injectable()
export class FindStaffByIdUseCase {
  public constructor(
    @Inject(STAFF_REPOSITORY) private readonly repository: IStaffRepository,
  ) {}

  public async execute(id: string): Promise<Result<Staff, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Staff', id));
    }
    return Result.success(entity);
  }
}
