/**
 * File: soft-delete-vital-sign.usecase.ts
 * Module: vital-signs
 * Purpose: Soft-delete vital-sign.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { VITAL_SIGNS_REPOSITORY } from '../constants/vital-signs.constants';
import type { IVitalSignRepository } from '../interfaces/vital-sign-repository.interface';

@Injectable()
export class SoftDeleteVitalSignUseCase {
  public constructor(
    @Inject(VITAL_SIGNS_REPOSITORY) private readonly repository: IVitalSignRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('VitalSign', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
