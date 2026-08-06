/**
 * File: soft-delete-consultation.usecase.ts
 * Module: consultations
 * Purpose: Soft-delete consultation.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { CONSULTATIONS_REPOSITORY } from '../constants/consultations.constants';
import type { IConsultationRepository } from '../interfaces/consultation-repository.interface';

@Injectable()
export class SoftDeleteConsultationUseCase {
  public constructor(
    @Inject(CONSULTATIONS_REPOSITORY) private readonly repository: IConsultationRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Consultation', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
