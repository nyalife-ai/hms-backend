/**
 * File: update-laboratory.usecase.ts
 * Module: laboratory
 * Purpose: Update laboratory.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateLaboratoryDto } from '../dto';
import { LaboratoryName } from '../domain/value-objects/laboratory-name.vo';
import { LABORATORY_REPOSITORY } from '../constants/laboratory.constants';
import { Laboratory } from '../domain/laboratory.entity';
import type { ILaboratoryRepository } from '../interfaces/laboratory-repository.interface';

@Injectable()
export class UpdateLaboratoryUseCase {
  public constructor(
    @Inject(LABORATORY_REPOSITORY) private readonly repository: ILaboratoryRepository,
  ) {}

  public async execute(id: string, dto: UpdateLaboratoryDto): Promise<Result<Laboratory, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Laboratory', id));
    }
    try {
      const next = Laboratory.reconstitute(
        existing.getId(),
        {
          name: dto.name ? LaboratoryName.create(dto.name) : existing.getName(),
          description: dto.description ?? existing.getDescription(),
          patientId: existing.getPatientId(),
          requestedBy: existing.getRequestedBy(),
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
