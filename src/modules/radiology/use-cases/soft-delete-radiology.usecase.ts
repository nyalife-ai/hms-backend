/**
 * File: soft-delete-radiology.usecase.ts
 * Module: radiology
 * Purpose: Soft-delete radiology.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { RADIOLOGY_REPOSITORY } from '../constants/radiology.constants';
import type { IRadiologyRepository } from '../interfaces/radiology-repository.interface';

@Injectable()
export class SoftDeleteRadiologyUseCase {
  public constructor(
    @Inject(RADIOLOGY_REPOSITORY) private readonly repository: IRadiologyRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Radiology', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
