/**
 * File: find-all-consultations.usecase.ts
 * Module: consultations
 * Purpose: Paginated list of consultations.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { ConsultationsQueryDto } from '../dto';
import { CONSULTATIONS_REPOSITORY } from '../constants/consultations.constants';
import type { IConsultationRepository, ConsultationPage } from '../interfaces/consultation-repository.interface';

@Injectable()
export class FindAllConsultationsUseCase {
  public constructor(
    @Inject(CONSULTATIONS_REPOSITORY) private readonly repository: IConsultationRepository,
  ) {}

  public async execute(query: ConsultationsQueryDto): Promise<Result<ConsultationPage, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
