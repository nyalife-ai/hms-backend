/**
 * File: create-admission.usecase.ts
 * Module: admissions
 * Purpose: Create admission use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateAdmissionDto } from '../dto';
import { Admission } from '../domain/admission.entity';
import { ADMISSIONS_REPOSITORY } from '../constants/admissions.constants';
import type { IAdmissionRepository } from '../interfaces/admission-repository.interface';

@Injectable()
export class CreateAdmissionUseCase {
  public constructor(
    @Inject(ADMISSIONS_REPOSITORY) private readonly repository: IAdmissionRepository,
  ) {}

  public async execute(dto: CreateAdmissionDto): Promise<Result<Admission, string>> {
    try {
      const entity = Admission.create({ name: dto.name, description: dto.description });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
