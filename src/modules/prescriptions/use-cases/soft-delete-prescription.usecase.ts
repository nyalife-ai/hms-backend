/**
 * File: soft-delete-prescription.usecase.ts
 * Module: prescriptions
 * Purpose: Soft-delete prescription.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { PRESCRIPTIONS_REPOSITORY } from '../constants/prescriptions.constants';
import type { IPrescriptionRepository } from '../interfaces/prescription-repository.interface';

@Injectable()
export class SoftDeletePrescriptionUseCase {
  public constructor(
    @Inject(PRESCRIPTIONS_REPOSITORY) private readonly repository: IPrescriptionRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('Prescription', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
