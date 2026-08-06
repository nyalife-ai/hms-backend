/**
 * File: create-consultation.usecase.ts
 * Module: consultations
 * Purpose: Create consultation use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateConsultationDto } from '../dto';
import { Consultation } from '../domain/consultation.entity';
import { CONSULTATIONS_REPOSITORY } from '../constants/consultations.constants';
import type { IConsultationRepository } from '../interfaces/consultation-repository.interface';

@Injectable()
export class CreateConsultationUseCase {
  public constructor(
    @Inject(CONSULTATIONS_REPOSITORY)
    private readonly repository: IConsultationRepository,
  ) {}

  public async execute(
    dto: CreateConsultationDto,
  ): Promise<Result<Consultation, string>> {
    try {
      const entity = Consultation.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        createdBy: dto.createdBy,
        appointmentId: dto.appointmentId,
        status: dto.status,
        consultationType: dto.consultationType,
        priority: dto.priority,
        historyPresentIllness: dto.historyPresentIllness,
        treatmentPlan: dto.treatmentPlan,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
