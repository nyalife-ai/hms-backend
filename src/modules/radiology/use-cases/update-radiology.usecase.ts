/**
 * File: update-radiology.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateRadiologyDto } from '../dto';
import { RADIOLOGY_REPOSITORY } from '../constants/radiology.constants';
import type { Radiology } from '../domain/radiology.entity';
import type { IRadiologyRepository } from '../interfaces/radiology-repository.interface';

@Injectable()
export class UpdateRadiologyUseCase {
  public constructor(
    @Inject(RADIOLOGY_REPOSITORY)
    private readonly repository: IRadiologyRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateRadiologyDto,
  ): Promise<Result<Radiology, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('Radiology', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        requestingDoctorId: dto.requestingDoctorId,
        consultationId: dto.consultationId,
        priority: dto.priority,
        status: dto.status,
        scanTypeId: dto.scanTypeId,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
