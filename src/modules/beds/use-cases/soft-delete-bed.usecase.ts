/**
 * File: soft-delete-bed.usecase.ts
 * Module: beds
 * Purpose: Soft-delete bed.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { BEDS_REPOSITORY } from '../constants/beds.constants';
import type { IBedRepository } from '../interfaces/bed-repository.interface';

@Injectable()
export class SoftDeleteBedUseCase {
  public constructor(
    @Inject(BEDS_REPOSITORY) private readonly repository: IBedRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Bed', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
