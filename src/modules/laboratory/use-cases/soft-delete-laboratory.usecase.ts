/**
 * File: soft-delete-laboratory.usecase.ts
 * Module: laboratory
 * Purpose: Soft-delete laboratory.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { LABORATORY_REPOSITORY } from '../constants/laboratory.constants';
import type { ILaboratoryRepository } from '../interfaces/laboratory-repository.interface';

@Injectable()
export class SoftDeleteLaboratoryUseCase {
  public constructor(
    @Inject(LABORATORY_REPOSITORY) private readonly repository: ILaboratoryRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Laboratory', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
