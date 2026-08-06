/**
 * File: find-prescription-by-id.usecase.ts
 * Module: prescriptions
 * Purpose: Find prescription by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { PRESCRIPTIONS_REPOSITORY } from '../constants/prescriptions.constants';
import type { Prescription } from '../domain/prescription.entity';
import type { IPrescriptionRepository } from '../interfaces/prescription-repository.interface';

@Injectable()
export class FindPrescriptionByIdUseCase {
  public constructor(
    @Inject(PRESCRIPTIONS_REPOSITORY) private readonly repository: IPrescriptionRepository,
  ) {}

  public async execute(id: string): Promise<Result<Prescription, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('Prescription', id));
    }
    return Result.success(entity);
  }
}
