/**
 * File: find-bed-by-id.usecase.ts
 * Module: beds
 * Purpose: Find bed by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { BEDS_REPOSITORY } from '../constants/beds.constants';
import type { Bed } from '../domain/bed.entity';
import type { IBedRepository } from '../interfaces/bed-repository.interface';

@Injectable()
export class FindBedByIdUseCase {
  public constructor(
    @Inject(BEDS_REPOSITORY) private readonly repository: IBedRepository,
  ) {}

  public async execute(id: string): Promise<Result<Bed, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Bed', id));
    }
    return Result.success(entity);
  }
}
