/**
 * File: create-follow-up.usecase.ts
 */

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
      let consultationId = dto.consultationId;
      if (!consultationId) {
        consultationId =
          (await this.repository.findLatestConsultationId(dto.patientId)) ??
          undefined;
      }
      if (!consultationId) {
        throw new BadRequestException(
          'consultationId is required when the patient has no prior consultation',
        );
      }
      if (!dto.createdBy) {
        throw new BadRequestException('createdBy is required');
      }

      const existing = await this.repository.findByConsultationAndDate(
        consultationId,
        new Date(dto.followUpDate),
      );
      if (existing) {
        return Result.success(existing);
      }

      const entity = FollowUp.create({
        patientId: dto.patientId,
        consultationId,
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
      if (err instanceof BadRequestException) throw err;
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
