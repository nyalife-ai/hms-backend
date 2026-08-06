/**
 * File: create-ward.usecase.ts
 */

import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { CreateWardDto } from '../dto';
import { Ward } from '../domain/ward.entity';
import { WARDS_REPOSITORY } from '../constants/wards.constants';
import type { IWardRepository } from '../interfaces/ward-repository.interface';

@Injectable()
export class CreateWardUseCase {
  public constructor(
    @Inject(WARDS_REPOSITORY) private readonly repository: IWardRepository,
  ) {}

  public async execute(dto: CreateWardDto): Promise<Result<Ward, string>> {
    try {
      const entity = Ward.create({
        name: dto.name,
        wardType: dto.wardType,
        departmentId: dto.departmentId,
        dailyRate: dto.dailyRate,
        capacity: dto.capacity,
        description: dto.description,
      });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
