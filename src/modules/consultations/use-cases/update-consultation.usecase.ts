/**
 * File: update-consultation.usecase.ts
 * Module: consultations
 * Purpose: Update consultation.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateConsultationDto } from '../dto';
import { CONSULTATIONS_REPOSITORY } from '../constants/consultations.constants';
import type { Consultation } from '../domain/consultation.entity';
import type { IConsultationRepository } from '../interfaces/consultation-repository.interface';

@Injectable()
export class UpdateConsultationUseCase {
  public constructor(
    @Inject(CONSULTATIONS_REPOSITORY)
    private readonly repository: IConsultationRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateConsultationDto,
  ): Promise<Result<Consultation, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Consultation', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        status: dto.status,
        consultationType: dto.consultationType,
        priority: dto.priority,
        historyPresentIllness: dto.historyPresentIllness,
        treatmentPlan: dto.treatmentPlan,
        appointmentId: dto.appointmentId,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
