/**
 * File: find-inpatient-by-id.usecase.ts
 * Module: inpatient
 * Purpose: Find inpatient by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { INPATIENT_REPOSITORY } from '../constants/inpatient.constants';
import type { Inpatient } from '../domain/inpatient.entity';
import type { IInpatientRepository } from '../interfaces/inpatient-repository.interface';

@Injectable()
export class FindInpatientByIdUseCase {
  public constructor(
    @Inject(INPATIENT_REPOSITORY) private readonly repository: IInpatientRepository,
  ) {}

  public async execute(id: string): Promise<Result<Inpatient, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Inpatient', id));
    }
    return Result.success(entity);
  }
}
