/**
 * File: find-ward-by-id.usecase.ts
 * Module: wards
 * Purpose: Find ward by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { WARDS_REPOSITORY } from '../constants/wards.constants';
import type { Ward } from '../domain/ward.entity';
import type { IWardRepository } from '../interfaces/ward-repository.interface';

@Injectable()
export class FindWardByIdUseCase {
  public constructor(
    @Inject(WARDS_REPOSITORY) private readonly repository: IWardRepository,
  ) {}

  public async execute(id: string): Promise<Result<Ward, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Ward', id));
    }
    return Result.success(entity);
  }
}
