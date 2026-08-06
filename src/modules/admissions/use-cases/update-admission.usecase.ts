/**
 * File: update-admission.usecase.ts
 * Module: admissions
 * Purpose: Update admission.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateAdmissionDto } from '../dto';
import { AdmissionName } from '../domain/value-objects/admission-name.vo';
import { ADMISSIONS_REPOSITORY } from '../constants/admissions.constants';
import { Admission } from '../domain/admission.entity';
import type { IAdmissionRepository } from '../interfaces/admission-repository.interface';

@Injectable()
export class UpdateAdmissionUseCase {
  public constructor(
    @Inject(ADMISSIONS_REPOSITORY) private readonly repository: IAdmissionRepository,
  ) {}

  public async execute(id: string, dto: UpdateAdmissionDto): Promise<Result<Admission, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Admission', id));
    }
    try {
      const next = Admission.reconstitute(
        existing.getId(),
        {
          name: dto.name ? AdmissionName.create(dto.name) : existing.getName(),
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
