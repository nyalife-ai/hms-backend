/**
 * File: find-radiology-by-id.usecase.ts
 * Module: radiology
 * Purpose: Find radiology by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { RADIOLOGY_REPOSITORY } from '../constants/radiology.constants';
import type { Radiology } from '../domain/radiology.entity';
import type { IRadiologyRepository } from '../interfaces/radiology-repository.interface';

@Injectable()
export class FindRadiologyByIdUseCase {
  public constructor(
    @Inject(RADIOLOGY_REPOSITORY) private readonly repository: IRadiologyRepository,
  ) {}

  public async execute(id: string): Promise<Result<Radiology, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Radiology', id));
    }
    return Result.success(entity);
  }
}
