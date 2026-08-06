/**
 * File: create-prescription.usecase.ts
 * Module: prescriptions
 * Purpose: Create prescription use-case.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreatePrescriptionDto } from '../dto';
import { Prescription } from '../domain/prescription.entity';
import { PRESCRIPTIONS_REPOSITORY } from '../constants/prescriptions.constants';
import type { IPrescriptionRepository } from '../interfaces/prescription-repository.interface';

@Injectable()
export class CreatePrescriptionUseCase {
  public constructor(
    @Inject(PRESCRIPTIONS_REPOSITORY)
    private readonly repository: IPrescriptionRepository,
  ) {}

  public async execute(
    dto: CreatePrescriptionDto,
  ): Promise<Result<Prescription, string>> {
    try {
      const entity = Prescription.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        prescribedBy: dto.prescribedBy,
        consultationId: dto.consultationId,
        status: dto.status,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
