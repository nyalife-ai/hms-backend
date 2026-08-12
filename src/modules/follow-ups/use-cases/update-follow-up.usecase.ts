/**
 * File: update-follow-up.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateFollowUpDto } from '../dto';
import { FOLLOW_UPS_REPOSITORY } from '../constants/follow-ups.constants';
import type { FollowUp } from '../domain/follow-up.entity';
import type { IFollowUpRepository } from '../interfaces/follow-up-repository.interface';

@Injectable()
export class UpdateFollowUpUseCase {
  public constructor(
    @Inject(FOLLOW_UPS_REPOSITORY)
    private readonly repository: IFollowUpRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateFollowUpDto,
  ): Promise<Result<FollowUp, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('FollowUp', id));
    }
    try {
      existing.update({
        followUpDate: dto.followUpDate,
        followUpType: dto.followUpType ?? dto.type,
        reason: dto.reason,
        status: dto.status,
        notes: dto.notes,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
