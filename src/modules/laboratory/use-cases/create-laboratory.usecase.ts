/**
 * File: create-laboratory.usecase.ts
 * Module: laboratory
 * Purpose: Create laboratory use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateLaboratoryDto } from '../dto';
import { Laboratory } from '../domain/laboratory.entity';
import { LABORATORY_REPOSITORY } from '../constants/laboratory.constants';
import type { ILaboratoryRepository } from '../interfaces/laboratory-repository.interface';

@Injectable()
export class CreateLaboratoryUseCase {
  public constructor(
    @Inject(LABORATORY_REPOSITORY) private readonly repository: ILaboratoryRepository,
  ) {}

  public async execute(dto: CreateLaboratoryDto): Promise<Result<Laboratory, string>> {
    try {
      const entity = Laboratory.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        requestedBy: dto.requestedBy,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
