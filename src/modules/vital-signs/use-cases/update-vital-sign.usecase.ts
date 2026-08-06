/**
 * File: update-vital-sign.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { UpdateVitalSignDto } from '../dto';
import { VITAL_SIGNS_REPOSITORY } from '../constants/vital-signs.constants';
import type { VitalSign } from '../domain/vital-sign.entity';
import type { IVitalSignRepository } from '../interfaces/vital-sign-repository.interface';

@Injectable()
export class UpdateVitalSignUseCase {
  public constructor(
    @Inject(VITAL_SIGNS_REPOSITORY)
    private readonly repository: IVitalSignRepository,
  ) {}

  public async execute(
    id: string,
    dto: UpdateVitalSignDto,
  ): Promise<Result<VitalSign, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('VitalSign', id));
    }
    try {
      existing.update({
        name: dto.name,
        description: dto.description,
        bloodPressure: dto.bloodPressure,
        heartRate: dto.heartRate,
        respiratoryRate: dto.respiratoryRate,
        temperature: dto.temperature,
        weight: dto.weight,
        height: dto.height,
        bmi: dto.bmi,
        painLevel: dto.painLevel,
        oxygenSaturation: dto.oxygenSaturation,
        notes: dto.notes,
        measuredAt: dto.measuredAt,
        consultationId: dto.consultationId,
      });
      const saved = await this.repository.save(existing);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
