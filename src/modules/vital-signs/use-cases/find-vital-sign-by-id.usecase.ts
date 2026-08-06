/**
 * File: find-vital-sign-by-id.usecase.ts
 * Module: vital-signs
 * Purpose: Find vital-sign by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { VITAL_SIGNS_REPOSITORY } from '../constants/vital-signs.constants';
import type { VitalSign } from '../domain/vital-sign.entity';
import type { IVitalSignRepository } from '../interfaces/vital-sign-repository.interface';

@Injectable()
export class FindVitalSignByIdUseCase {
  public constructor(
    @Inject(VITAL_SIGNS_REPOSITORY) private readonly repository: IVitalSignRepository,
  ) {}

  public async execute(id: string): Promise<Result<VitalSign, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('VitalSign', id));
    }
    return Result.success(entity);
  }
}
