/**
 * File: create-follow-up.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateFollowUpDto } from '../dto';
import { FollowUp } from '../domain/follow-up.entity';
import { FOLLOW_UPS_REPOSITORY } from '../constants/follow-ups.constants';
import type { IFollowUpRepository } from '../interfaces/follow-up-repository.interface';

@Injectable()
export class CreateFollowUpUseCase {
  public constructor(
    @Inject(FOLLOW_UPS_REPOSITORY)
    private readonly repository: IFollowUpRepository,
  ) {}

  public async execute(
    dto: CreateFollowUpDto,
  ): Promise<Result<FollowUp, string>> {
    try {
      const entity = FollowUp.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        consultationId: dto.consultationId,
        followUpDate: dto.followUpDate,
        followUpType: dto.followUpType,
        reason: dto.reason,
        status: dto.status,
        notes: dto.notes,
        createdBy: dto.createdBy,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
