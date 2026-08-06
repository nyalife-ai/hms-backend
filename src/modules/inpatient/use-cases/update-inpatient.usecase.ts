/**
 * File: update-inpatient.usecase.ts
 * Module: inpatient
 * Purpose: Update inpatient.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateInpatientDto } from '../dto';
import { InpatientName } from '../domain/value-objects/inpatient-name.vo';
import { INPATIENT_REPOSITORY } from '../constants/inpatient.constants';
import { Inpatient } from '../domain/inpatient.entity';
import type { IInpatientRepository } from '../interfaces/inpatient-repository.interface';

@Injectable()
export class UpdateInpatientUseCase {
  public constructor(
    @Inject(INPATIENT_REPOSITORY) private readonly repository: IInpatientRepository,
  ) {}

  public async execute(id: string, dto: UpdateInpatientDto): Promise<Result<Inpatient, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Inpatient', id));
    }
    try {
      const next = Inpatient.reconstitute(
        existing.getId(),
        {
          name: dto.name ? InpatientName.create(dto.name) : existing.getName(),
          description: dto.description ?? existing.getDescription(),
        },
        existing.getCreatedAt(),
        new Date(),
      );
      const saved = await this.repository.save(next);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
