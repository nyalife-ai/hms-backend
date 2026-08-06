/**
 * File: find-laboratory-by-id.usecase.ts
 * Module: laboratory
 * Purpose: Find laboratory by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { LABORATORY_REPOSITORY } from '../constants/laboratory.constants';
import type { Laboratory } from '../domain/laboratory.entity';
import type { ILaboratoryRepository } from '../interfaces/laboratory-repository.interface';

@Injectable()
export class FindLaboratoryByIdUseCase {
  public constructor(
    @Inject(LABORATORY_REPOSITORY) private readonly repository: ILaboratoryRepository,
  ) {}

  public async execute(id: string): Promise<Result<Laboratory, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Laboratory', id));
    }
    return Result.success(entity);
  }
}
