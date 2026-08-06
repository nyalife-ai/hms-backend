/**
 * File: find-follow-up-by-id.usecase.ts
 * Module: follow-ups
 * Purpose: Find follow-up by id.
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { FOLLOW_UPS_REPOSITORY } from '../constants/follow-ups.constants';
import type { FollowUp } from '../domain/follow-up.entity';
import type { IFollowUpRepository } from '../interfaces/follow-up-repository.interface';

@Injectable()
export class FindFollowUpByIdUseCase {
  public constructor(
    @Inject(FOLLOW_UPS_REPOSITORY) private readonly repository: IFollowUpRepository,
  ) {}

  public async execute(id: string): Promise<Result<FollowUp, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('FollowUp', id));
    }
    return Result.success(entity);
  }
}
