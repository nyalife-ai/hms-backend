/**
 * File: soft-delete-ward.usecase.ts
 * Module: wards
 * Purpose: Soft-delete ward.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { WARDS_REPOSITORY } from '../constants/wards.constants';
import type { IWardRepository } from '../interfaces/ward-repository.interface';

@Injectable()
export class SoftDeleteWardUseCase {
  public constructor(
    @Inject(WARDS_REPOSITORY) private readonly repository: IWardRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Ward', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
