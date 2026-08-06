/**
 * File: create-inpatient.usecase.ts
 * Module: inpatient
 * Purpose: Create inpatient use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateInpatientDto } from '../dto';
import { Inpatient } from '../domain/inpatient.entity';
import { INPATIENT_REPOSITORY } from '../constants/inpatient.constants';
import type { IInpatientRepository } from '../interfaces/inpatient-repository.interface';

@Injectable()
export class CreateInpatientUseCase {
  public constructor(
    @Inject(INPATIENT_REPOSITORY) private readonly repository: IInpatientRepository,
  ) {}

  public async execute(dto: CreateInpatientDto): Promise<Result<Inpatient, string>> {
    try {
      const entity = Inpatient.create({ name: dto.name, description: dto.description });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
