/**
 * File: create-radiology.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateRadiologyDto } from '../dto';
import { Radiology } from '../domain/radiology.entity';
import { RADIOLOGY_REPOSITORY } from '../constants/radiology.constants';
import type { IRadiologyRepository } from '../interfaces/radiology-repository.interface';

@Injectable()
export class CreateRadiologyUseCase {
  public constructor(
    @Inject(RADIOLOGY_REPOSITORY)
    private readonly repository: IRadiologyRepository,
  ) {}

  public async execute(
    dto: CreateRadiologyDto,
  ): Promise<Result<Radiology, string>> {
    try {
      const entity = Radiology.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        scanTypeId: dto.scanTypeId,
        requestedBy: dto.requestedBy,
        requestingDoctorId: dto.requestingDoctorId,
        consultationId: dto.consultationId,
        priority: dto.priority,
        status: dto.status,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
