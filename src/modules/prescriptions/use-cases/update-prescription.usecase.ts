/**
 * File: update-prescription.usecase.ts
 * Module: prescriptions
 * Purpose: Update prescription.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdatePrescriptionDto } from '../dto';
import { PRESCRIPTIONS_REPOSITORY } from '../constants/prescriptions.constants';
import type { Prescription } from '../domain/prescription.entity';
import type { IPrescriptionRepository } from '../interfaces/prescription-repository.interface';

@Injectable()
export class UpdatePrescriptionUseCase {
  public constructor(
    @Inject(PRESCRIPTIONS_REPOSITORY)
    private readonly repository: IPrescriptionRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdatePrescriptionDto,
  ): Promise<Result<Prescription, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Prescription', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        status: dto.status,
        consultationId: dto.consultationId,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
