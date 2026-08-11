/**
 * File: create-vital-sign.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateVitalSignDto } from '../dto';
import { VitalSign } from '../domain/vital-sign.entity';
import { VITAL_SIGNS_REPOSITORY } from '../constants/vital-signs.constants';
import type { IVitalSignRepository } from '../interfaces/vital-sign-repository.interface';

@Injectable()
export class CreateVitalSignUseCase {
  public constructor(
    @Inject(VITAL_SIGNS_REPOSITORY)
    private readonly repository: IVitalSignRepository,
  ) {}

  public async execute(
    dto: CreateVitalSignDto,
  ): Promise<Result<VitalSign, string>> {
    try {
      const entity = VitalSign.create({
        name: dto.name,
        description: dto.description,
        patientId: dto.patientId,
        recordedBy: dto.recordedBy,
        consultationId: dto.consultationId,
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
        urgencyLevel: dto.urgencyLevel,
        measuredAt: dto.measuredAt,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
