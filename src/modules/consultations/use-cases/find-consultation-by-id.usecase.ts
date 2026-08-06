/**
 * File: find-consultation-by-id.usecase.ts
 * Module: consultations
 * Purpose: Find consultation by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { CONSULTATIONS_REPOSITORY } from '../constants/consultations.constants';
import type { Consultation } from '../domain/consultation.entity';
import type { IConsultationRepository } from '../interfaces/consultation-repository.interface';

@Injectable()
export class FindConsultationByIdUseCase {
  public constructor(
    @Inject(CONSULTATIONS_REPOSITORY) private readonly repository: IConsultationRepository,
  ) {}

  public async execute(id: string): Promise<Result<Consultation, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Consultation', id));
    }
    return Result.success(entity);
  }
}
