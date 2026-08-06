/**
 * File: soft-delete-follow-up.usecase.ts
 * Module: follow-ups
 * Purpose: Soft-delete follow-up.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { FOLLOW_UPS_REPOSITORY } from '../constants/follow-ups.constants';
import type { IFollowUpRepository } from '../interfaces/follow-up-repository.interface';

@Injectable()
export class SoftDeleteFollowUpUseCase {
  public constructor(
    @Inject(FOLLOW_UPS_REPOSITORY) private readonly repository: IFollowUpRepository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('FollowUp', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
